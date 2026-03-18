# Phase 3: Session & Transport Metrics - Context

**Gathered:** 2026-03-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Add two distinct metric concerns to the HTTP transport:
1. **Session gauge** — `mcp_active_sessions` tracks current active MCP sessions in real-time, tied to the session lifecycle in `startHttp()`.
2. **HTTP transport metrics** — latency histogram, request counter, and payload size histograms implemented as Express middleware on the MCP app.

No changes to the metrics server (Port 9090, `/metrics`, `/healthz` — all Phase 1). No changes to tool-level metrics (Phase 2). Metrics server on stdio mode stays excluded.

</domain>

<decisions>
## Implementation Decisions

### Session gauge — metric definition

`mcp_active_sessions` gauge (no labels) in `src/metrics/session-metrics.ts`:
- Increments when a new MCP session is initialized (`onsessioninitialized` callback in `src/index.ts`)
- Decrements when any session ends — whether from client disconnect, explicit DELETE `/mcp`, or TTL reaper eviction. `destroySession()` is the single exit point for all session endings; decrement happens there.
- No guard for `HARNESS_METRICS_ENABLED` — gauge is always defined and updated. If metrics server is disabled, the data is never scraped but collecting it has negligible cost.

### Session gauge — wiring

`src/metrics/session-metrics.ts` exports two functions:
```typescript
export function sessionConnected(): void   // calls gauge.inc()
export function sessionDisconnected(): void // calls gauge.dec()
```

`src/index.ts` imports and calls:
- `sessionConnected()` inside `onsessioninitialized` callback (after `sessions.set(id, ...)`)
- `sessionDisconnected()` inside `destroySession()` (before or after `sessions.delete(sessionId)`)

### HTTP transport metrics — metric definitions

All 4 HTTP metrics in `src/metrics/transport-metrics.ts`, registered on `registry` from `src/metrics/registry.ts`:

| Metric | Type | Labels | Buckets |
|--------|------|--------|---------|
| `http_request_duration_seconds` | Histogram | `{method, path, status}` | `[0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5]` |
| `http_requests_total` | Counter | `{method, path, status}` | — |
| `mcp_request_size_bytes` | Histogram | none (label-free) | `[0, 100, 1000, 10000, 100000, 1000000]` |
| `mcp_response_size_bytes` | Histogram | none (label-free) | `[0, 100, 1000, 10000, 100000, 1000000]` |

Label values:
- `method` — `req.method` (GET, POST, DELETE)
- `path` — `req.path` as-is: `/mcp`, `/health`, or other literal paths. Only 2-3 distinct values — no cardinality risk.
- `status` — HTTP response status code as string (e.g., `"200"`, `"404"`, `"429"`)

Histogram buckets for duration: `[0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5]` — same as Phase 2 tool call histogram. Consistent schema across all latency metrics.

Size histogram buckets: `[0, 100, 1000, 10000, 100000, 1000000]` bytes — covers empty bodies through 1MB payloads.

### Request size measurement

`mcp_request_size_bytes`: use `Content-Length` request header.
```typescript
const size = parseInt(req.headers['content-length'] || '0', 10);
```
Requests without a body (GET, DELETE) will record 0 — that's correct.

### Response size measurement

`mcp_response_size_bytes`: use `Content-Length` response header only.
```typescript
res.on('finish', () => {
  const size = parseInt(res.getHeader('content-length') as string || '0', 10);
  responseSize.observe(size);
});
```
SSE streams won't have `Content-Length` and will record 0 — acceptable per design decision (intercept-based approach deferred).

### HTTP metrics middleware — wiring

`src/metrics/transport-metrics.ts` exports:
```typescript
export function createHttpMetricsMiddleware(): RequestHandler
```

`src/index.ts` wires it in `startHttp()` immediately after `createMcpExpressApp()`, before JSON parser and other middleware:
```typescript
const app = createMcpExpressApp({ host });
if (config.HARNESS_METRICS_ENABLED) {
  app.use(createHttpMetricsMiddleware());
}
// ... then json(), CORS, rate limit, routes
```

Guard with `HARNESS_METRICS_ENABLED` here (unlike the session gauge) because the middleware runs on every request — cleaner to skip entirely when metrics are off.

### File structure

```
src/metrics/
  registry.ts          (Phase 1 — custom prom-client registry)
  server.ts            (Phase 1 — metrics Express server on :9090)
  tool-metrics.ts      (Phase 2 — tool call counter, histogram, withMetrics HOF)
  session-metrics.ts   (Phase 3 — mcp_active_sessions gauge + sessionConnected/sessionDisconnected)
  transport-metrics.ts (Phase 3 — 4 HTTP metrics + createHttpMetricsMiddleware())
```

### Claude's Discretion

- Exact size histogram bucket boundaries (the `[0, 100, 1000, ...]` suggestion above is a starting point)
- Whether to add a `tests/metrics/transport-metrics.test.ts` test file (recommended)
- Whether to add a `tests/metrics/session-metrics.test.ts` test file (recommended)
- Internal variable naming within the new files

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 1 & 2 foundations
- `src/metrics/registry.ts` — custom prom-client Registry; all new metrics must use `registers: [registry]`
- `src/metrics/tool-metrics.ts` — canonical pattern for Phase 3 metrics files (counter/histogram definitions, export style, import pattern)

### Integration points
- `src/index.ts` — `startHttp()` function: session lifecycle hooks (`onsessioninitialized`, `destroySession()`), Express app setup (`createMcpExpressApp`, `app.use()`), and shutdown flow
- `src/config.ts` — `HARNESS_METRICS_ENABLED` config field (used to guard HTTP middleware in startHttp)

### Requirements
- `.planning/REQUIREMENTS.md` — SESS-01, SESS-02, HTTP-01, HTTP-02, HTTP-03, HTTP-04 definitions
- `.planning/ROADMAP.md` — Phase 3 success criteria (6 criteria)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/metrics/registry.ts`: Singleton `registry` — import as `registers: [registry]` for all new metrics
- `src/metrics/tool-metrics.ts`: Canonical file structure pattern — counter/histogram definitions at top, exported functions below, logger for swallowed errors
- `src/utils/logger.ts`: `createLogger("session-metrics")` / `createLogger("transport-metrics")` for namespaced stderr logging

### Established Patterns
- Metrics files define prom-client metrics as module-level constants + export named functions
- Middleware in `startHttp()` added via `app.use(...)` after `createMcpExpressApp({ host })`
- Existing middleware order: JSON parser → JWT auth → CORS → rate limiter → routes. HTTP metrics middleware should come FIRST (before JSON parser) to capture raw timing from the moment the request arrives.

### Integration Points
- `src/index.ts` `onsessioninitialized` callback (line ~256): call `sessionConnected()` here
- `src/index.ts` `destroySession()` function (line ~181): call `sessionDisconnected()` here
- `src/index.ts` `startHttp()` after `createMcpExpressApp()`: add `app.use(createHttpMetricsMiddleware())`

</code_context>

<specifics>
## Specific Ideas

- HTTP metrics middleware must run before JSON body parsing — latency should include the time to read and parse the body, not start after it's already parsed
- The `res.on('finish', ...)` hook is the standard Express pattern for post-response work — use it for both latency timer end and response size recording

</specifics>

<deferred>
## Deferred Ideas

- Intercept-based response size tracking (monkey-patching res.write/res.end) — would capture SSE stream sizes; deferred in favor of simpler Content-Length approach
- Runtime metrics (`collectDefaultMetrics()` — event loop lag, GC, memory) — v2 requirement (RUNTIME-01)

</deferred>

---

*Phase: 03-session-transport-metrics*
*Context gathered: 2026-03-19*
