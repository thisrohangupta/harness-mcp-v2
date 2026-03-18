---
phase: 01-metrics-infrastructure
plan: 02
subsystem: metrics
tags: [infrastructure, prometheus, http-server, express, lifecycle]
completed_at: "2026-03-18T21:40:16Z"
duration_seconds: 219

dependency_graph:
  requires:
    - metrics-registry
    - metrics-config
  provides:
    - metrics-http-server
    - metrics-lifecycle-integration
  affects:
    - src/metrics/server.ts
    - src/index.ts
    - tests/metrics/server.test.ts

tech_stack:
  added: []
  patterns:
    - Express bare routes (no middleware)
    - Promise-based server lifecycle (start/close)
    - Fail-hard on port binding errors
    - Graceful shutdown with ordered cleanup

key_files:
  created:
    - src/metrics/server.ts
    - tests/metrics/server.test.ts
  modified:
    - src/index.ts

decisions:
  - decision: Start metrics server BEFORE MCP transport in HTTP mode
    rationale: Ensures metrics endpoint is available for scraping before MCP traffic begins
    impact: Operators can monitor server health from the moment it starts accepting requests
  - decision: Fail hard (process.exit(1)) if metrics port binding fails
    rationale: Operators need to notice misconfiguration immediately, not discover missing metrics later
    impact: Server won't start silently without metrics in production
  - decision: Close metrics server AFTER MCP sessions drain on shutdown
    rationale: Allows final scrape during graceful shutdown to capture shutdown metrics
    impact: No data loss during rolling restarts
  - decision: No middleware on metrics Express app
    rationale: Minimize overhead, no CORS/auth needed for internal scraping endpoint
    impact: Lightest possible metrics server footprint

metrics:
  tasks_completed: 2
  tasks_total: 2
  commits: 3
  files_created: 2
  files_modified: 1
  tests_added: 10
  lines_added: 176
---

# Phase 01 Plan 02: Metrics HTTP Server & Lifecycle Summary

**One-liner:** Created Express-based metrics HTTP server with /metrics (GET+HEAD), /healthz, 404 handler, integrated into main entrypoint with startup-before-MCP and shutdown-after-MCP lifecycle

## What Was Built

This plan created the HTTP server infrastructure for Prometheus metrics scraping and integrated it into the main server lifecycle with proper startup ordering and graceful shutdown.

### Task 1: Create Metrics Express Server (TDD)

**Completed:** ✓
**Commits:** `41b379d` (RED), `e26e0e5` (GREEN)

Followed TDD flow: RED (failing tests) → GREEN (implementation).

**RED Phase (commit 41b379d):**
- Created `tests/metrics/server.test.ts` with 10 test cases
- Tests verified all endpoint behaviors, response headers, and lifecycle methods
- Tests failed as expected (module not found)

**GREEN Phase (commit e26e0e5):**
- Created `src/metrics/server.ts` with Express HTTP server
- Implemented all routes per plan specifications
- All 10 tests passed

**Routes Implemented:**
- `GET /metrics` — Returns Prometheus text exposition format via `registry.metrics()`
- `HEAD /metrics` — Returns 200 + Content-Type header, no body
- `GET /healthz` — Returns `{"status":"ok"}` with no registry check
- All other routes — Returns 404 Not Found

**Key Features:**
- Binds to `0.0.0.0` by default (container/Kubernetes-friendly)
- No middleware (bare routes only per CONTEXT.md decision)
- Error handling on metrics collection failure (500 response)
- Promise-based `close()` method for graceful shutdown
- Structured logging to stderr via `createLogger("metrics")`

**Files Created:**
- `src/metrics/server.ts` — 69 lines, exports `createMetricsServer` and `MetricsServer` interface
- `tests/metrics/server.test.ts` — 85 lines, 10 test cases

**Tests Added:**
1. GET /metrics returns 200 with Content-Type containing text/plain
2. GET /metrics body contains mcp_build_info
3. GET /metrics body contains # HELP and # TYPE (Prometheus format)
4. HEAD /metrics returns 200 with Content-Type header, empty body
5. GET /healthz returns 200 with body {"status":"ok"}
6. GET /healthz Content-Type contains application/json
7. GET /unknown-route returns 404
8. POST /metrics returns 404
9. Server listens on specified port
10. Server close() resolves without error

**Verification:**
```bash
✓ TypeScript compilation successful
✓ All 10 tests pass
✓ Server starts on test port (19091)
✓ Server closes gracefully without errors
```

### Task 2: Integrate Metrics Server Lifecycle

**Completed:** ✓
**Commit:** `c2d8a5c`

Integrated metrics server into the main server entrypoint with proper lifecycle management.

**Changes to `src/index.ts`:**

1. **Import added** (line 19):
   ```typescript
   import { createMetricsServer, type MetricsServer } from "./metrics/server.js";
   ```

2. **Startup logic added** (lines 101-112):
   - Metrics server starts BEFORE `const host = process.env.HOST`
   - Conditional on `config.HARNESS_METRICS_ENABLED`
   - Fail-hard on port binding failure (process.exit(1))
   - Logs error with port and error details

3. **Shutdown logic added** (lines 398-402):
   - Metrics server closes AFTER `destroySession` loop
   - Allows final scrape during graceful drain
   - Logs "Metrics server closed" on successful close
   - Catches and ignores close errors (draining anyway)

**Lifecycle Order:**

**Startup (HTTP mode only):**
1. Metrics server starts on port 9090 (configurable)
2. MCP HTTP transport starts on port 3000 (or --port)
3. Server begins accepting requests

**Shutdown (SIGINT/SIGTERM):**
1. Stop accepting new connections
2. Reject new requests via middleware
3. Close all MCP sessions (destroy transports)
4. Close metrics server (allows final scrape)
5. Wait for connections to drain
6. Exit

**Transport Awareness:**
- Metrics server starts in HTTP mode ONLY
- `startStdio()` function unchanged (no metrics server references)
- Stdio mode continues to work exactly as before

**Files Modified:**
- `src/index.ts` — Added 22 lines (import + startup + shutdown logic)

**Verification:**
```bash
✓ TypeScript compilation successful
✓ createMetricsServer import found
✓ HARNESS_METRICS_ENABLED check found
✓ HARNESS_METRICS_PORT usage found
✓ process.exit(1) in metrics error handler
✓ metricsServer.close() in shutdown handler
✓ startStdio has no metrics references
```

## Deviations from Plan

None — plan executed exactly as written.

## Technical Highlights

### Express Bare Routes Pattern

The metrics server uses Express with no middleware per CONTEXT.md decision:

```typescript
export function createMetricsServer(port: number, host: string = "0.0.0.0"): Promise<MetricsServer> {
  const app = express();

  // Direct route handlers — no middleware
  app.get("/metrics", async (_req, res) => { /* ... */ });
  app.head("/metrics", (_req, res) => { /* ... */ });
  app.get("/healthz", (_req, res) => { /* ... */ });
  app.use((_req, res) => { res.status(404).end("Not Found"); });

  return new Promise<MetricsServer>((resolve, reject) => {
    const server = app.listen(port, host, () => {
      log.info(`Server listening on ${host}:${port}`);
      resolve({
        server,
        close: () => new Promise<void>((res, rej) => {
          server.close((err) => (err ? rej(err) : res()));
        }),
      });
    });

    server.on("error", (err) => {
      reject(err);
    });
  });
}
```

**Benefits:**
- Minimal overhead (no CORS, no auth, no request logging)
- Container-friendly (binds to 0.0.0.0 by default)
- Simple to understand and maintain
- No dependencies on middleware stack

### Fail-Hard Port Binding Strategy

The integration ensures the server never starts silently without metrics:

```typescript
if (config.HARNESS_METRICS_ENABLED) {
  try {
    metricsServer = await createMetricsServer(config.HARNESS_METRICS_PORT);
  } catch (err) {
    log.error("Failed to start metrics server — exiting", {
      port: config.HARNESS_METRICS_PORT,
      error: String(err),
    });
    process.exit(1);
  }
}
```

**Benefits:**
- Operators notice misconfiguration immediately
- No silent failures that lead to missing metrics in production
- Clear error messages with port and error details

### Ordered Shutdown for Final Scrape

The shutdown sequence ensures metrics remain available during graceful drain:

```typescript
// 3. Close all sessions (terminates SSE streams, notifies transports)
clearInterval(reaper);
for (const [id] of sessions) {
  destroySession(id);
}

// Close metrics server last — allows final scrape during drain
if (metricsServer) {
  metricsServer.close().then(() => {
    log.info("Metrics server closed");
  }).catch(() => {});
}
```

**Benefits:**
- Prometheus can scrape final metrics during rolling restarts
- No data loss on graceful shutdown
- Metrics reflect true shutdown state

### HEAD Request Support

The `/metrics` endpoint supports HEAD requests per HTTP spec and Prometheus conventions:

```typescript
app.head("/metrics", (_req, res) => {
  res.setHeader("Content-Type", registry.contentType);
  res.status(200).end();
});
```

**Benefits:**
- Allows health checks without downloading full metrics payload
- Standard HTTP semantics
- Minimal overhead for availability checks

## Requirements Coverage

This plan satisfies the following requirements from REQUIREMENTS.md:

- **INFRA-01**: Metrics server runs on separate HTTP port (9090) from MCP server (3000)
- **INFRA-04**: GET /metrics returns valid Prometheus text exposition format with correct Content-Type
- **INFRA-06**: GET /healthz returns 200 with {"status":"ok"}
- **INFRA-07**: Graceful shutdown (metrics server closes after MCP sessions drain)

## Next Steps

**Plan 03** will build on this foundation by:
1. Adding tool invocation metrics (counters, histograms)
2. Instrumenting all tool handlers with `mcp_tool_calls_total` and `mcp_tool_duration_seconds`
3. Module resolution for tool categorization (pipelines, connectors, etc.)

**Dependencies:**
- Plan 03 will import `registry` from `src/metrics/registry.ts`
- Tool handlers will register metrics in the registry created in Plan 01
- Metrics server will serve these metrics via the `/metrics` endpoint created in this plan

## Self-Check: PASSED

All claims verified:

**Created files exist:**
```bash
✓ FOUND: src/metrics/server.ts
✓ FOUND: tests/metrics/server.test.ts
```

**Modified files exist:**
```bash
✓ FOUND: src/index.ts (with metrics integration)
```

**Commits exist:**
```bash
✓ FOUND: 41b379d (Task 1 RED: failing tests)
✓ FOUND: e26e0e5 (Task 1 GREEN: implementation)
✓ FOUND: c2d8a5c (Task 2: lifecycle integration)
```

**TypeScript compilation:**
```bash
✓ pnpm exec tsc --noEmit passes
```

**Tests pass:**
```bash
✓ Test Files: 39 passed (39)
✓ Tests: 538 passed (538)
✓ Metrics server tests: 10 passed (10)
```

**Acceptance criteria (Task 1):**
```bash
✓ src/metrics/server.ts contains export function createMetricsServer
✓ src/metrics/server.ts contains app.get("/metrics"
✓ src/metrics/server.ts contains app.head("/metrics"
✓ src/metrics/server.ts contains app.get("/healthz"
✓ src/metrics/server.ts contains registry.metrics()
✓ src/metrics/server.ts contains registry.contentType
✓ src/metrics/server.ts contains 0.0.0.0 as default host
✓ src/metrics/server.ts contains { status: "ok" } in healthz handler
✓ src/metrics/server.ts contains 404 and Not Found in catch-all
✓ tests/metrics/server.test.ts contains 10 test cases
```

**Acceptance criteria (Task 2):**
```bash
✓ src/index.ts contains import createMetricsServer
✓ src/index.ts contains HARNESS_METRICS_ENABLED check
✓ src/index.ts contains createMetricsServer(config.HARNESS_METRICS_PORT)
✓ src/index.ts contains process.exit(1) in metrics error handler
✓ src/index.ts contains metricsServer.close() in shutdown
✓ src/index.ts contains log.info("Metrics server closed")
✓ Metrics server starts BEFORE const host = process.env.HOST
✓ Metrics server closes AFTER destroySession loop
✓ startStdio function has no metrics references
```

All deliverables confirmed. Plan 01-02 execution complete.
