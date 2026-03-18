# Phase 1: Metrics Infrastructure - Context

**Gathered:** 2026-03-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Dedicated Prometheus metrics HTTP server with configuration, health checks, and graceful shutdown. Runs on a separate port from MCP traffic. Provides `/metrics` and `/healthz` endpoints. No tool instrumentation or session tracking — those are Phase 2 and Phase 3.

</domain>

<decisions>
## Implementation Decisions

### Server lifecycle
- Metrics server starts BEFORE MCP transport connects
- If metrics server fails to start (e.g., port in use), fail hard — exit with error, don't silently continue
- On graceful shutdown: MCP transport closes first, then metrics server closes (allows final scrape)
- Use Express (not native http) for the metrics server — consistency with the HTTP transport patterns

### Config & defaults
- Metrics enabled by default (HARNESS_METRICS_ENABLED defaults to true, operators opt-out)
- Default port: 9090 (standard Prometheus convention)
- No configurable metric name prefix — hardcode `mcp_` prefix. Metric names are a public contract
- Port validation: restrict to 1024-65535 via Zod (prevents privileged port issues)

### Endpoint behavior
- `/healthz` returns simple 200 OK with `{"status":"ok"}` — no registry check, no latency
- Unknown routes return 404 Not Found with short text body
- `/metrics` supports both GET and HEAD requests (HEAD returns 200 + Content-Type, no body)
- Include `mcp_build_info{version, node_version}` gauge from Phase 1 so there's at least one metric to verify the endpoint works

### Transport awareness
- Metrics server starts in HTTP mode ONLY — skip entirely in stdio mode
- Separate Express app instance on its own port (9090), fully isolated from MCP HTTP transport (3000)
- Bind to 0.0.0.0 (all interfaces) — required for container/Kubernetes scraping
- Log startup to stderr at info level: `[metrics] Server listening on 0.0.0.0:9090`
- No middleware on metrics Express app — bare routes only (no CORS, no auth, no request logging)

### Claude's Discretion
- Internal module structure (file organization within src/metrics/)
- Error response body format for 404s
- Exact shutdown timeout values
- Whether to use Express Router or direct app.get()

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Metrics stack
- `.planning/research/STACK.md` — prom-client patterns, custom Registry usage, histogram buckets, architecture patterns, testing strategy

### Project architecture
- `src/index.ts` — Server entrypoint, existing shutdown handlers (SIGINT/SIGTERM), transport selection logic
- `src/config.ts` — Zod config schema, env var validation patterns, existing config fields

### Requirements
- `.planning/REQUIREMENTS.md` — INFRA-01 through INFRA-07 definitions
- `.planning/ROADMAP.md` — Phase 1 success criteria (6 criteria)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/utils/logger.ts`: stderr-only structured logger with `createLogger("namespace")` pattern — use for metrics server logging
- `src/config.ts`: Zod schema with `z.coerce.number().default()` and `z.coerce.boolean().default()` patterns — extend for metrics config
- Express dependency already in package.json (v5.2.1) — no new HTTP dependency needed

### Established Patterns
- Config validation: All env vars validated through single Zod schema in `config.ts`, loaded via `loadConfig()`
- Logging: `createLogger("module-name")` creates namespaced stderr logger — metrics server should use `createLogger("metrics")`
- Shutdown: `process.on("SIGINT/SIGTERM")` handlers in `index.ts` close transport then server — metrics shutdown hooks fit here
- Transport modes: `parseArgs()` determines stdio vs http mode — metrics server conditional on http mode

### Integration Points
- `src/index.ts` — Metrics server lifecycle hooks into `startHttp()` function (not `startStdio()`)
- `src/config.ts` — New HARNESS_METRICS_* fields added to ConfigSchema
- `package.json` — New dependency: `prom-client@^15.1.3`

</code_context>

<specifics>
## Specific Ideas

- Use Express for consistency even though native http would be lighter — team prefers consistency over micro-optimization
- Fail hard on port binding failure — operators need to notice misconfiguration immediately, not discover missing metrics later

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-metrics-infrastructure*
*Context gathered: 2026-03-19*
