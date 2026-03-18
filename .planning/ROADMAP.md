# Roadmap: Harness MCP Server — Prometheus Metrics

**Project:** Adding Prometheus metrics to Harness MCP TypeScript server
**Created:** 2026-03-19
**Granularity:** Coarse (3-5 phases)

---

## Phases

- [ ] **Phase 1: Metrics Infrastructure** - Dedicated metrics server with configuration and health checks
- [ ] **Phase 2: Tool Instrumentation** - Counter and histogram metrics for MCP tool calls
- [ ] **Phase 3: Session & Transport Metrics** - HTTP session tracking and request/response metrics

---

## Phase Details

### Phase 1: Metrics Infrastructure

**Goal:** Operators can scrape Prometheus metrics from a dedicated, configurable HTTP endpoint

**Depends on:** Nothing (first phase)

**Requirements:** INFRA-01, INFRA-02, INFRA-03, INFRA-04, INFRA-05, INFRA-06, INFRA-07

**Success Criteria** (what must be TRUE):
1. Metrics server runs on a separate HTTP port (default 9090) isolated from MCP protocol traffic
2. Operator can configure metrics port via `HARNESS_METRICS_PORT` env var
3. Operator can enable/disable metrics entirely via `HARNESS_METRICS_ENABLED` env var
4. `GET /metrics` endpoint returns valid Prometheus text exposition format
5. `GET /healthz` endpoint returns 200 OK when metrics server is healthy
6. Metrics server shuts down gracefully when main MCP server stops

**Plans:** 2 plans

Plans:
- [ ] 01-01-PLAN.md — Install prom-client, extend config with metrics fields, create custom registry with build_info gauge
- [ ] 01-02-PLAN.md — Create metrics Express server (/metrics, /healthz, 404) and integrate lifecycle into main entrypoint

---

### Phase 2: Tool Instrumentation

**Goal:** Operators can observe which MCP tools are used, how often they fail, and their latency distribution

**Depends on:** Phase 1 (metrics infrastructure must exist)

**Requirements:** TOOL-01, TOOL-02, TOOL-03, TOOL-04, TOOL-05, TOOL-06

**Success Criteria** (what must be TRUE):
1. Every tool invocation increments `mcp_tool_calls_total{tool, module, outcome}` counter
2. Tool failures are classified as `ok`, `tool_error`, or `error` in outcome label
3. Every tool call records latency in `mcp_tool_call_duration_seconds{tool, module}` histogram
4. Module label is automatically derived from tool name via toolset registry (no manual mapping per tool)
5. Histogram provides p50, p95, p99 latency percentiles via default buckets (0.001 to 5 seconds)
6. Tool metrics collection adds less than 1ms overhead per tool call

**Plans:** TBD

---

### Phase 3: Session & Transport Metrics

**Goal:** Operators can monitor active HTTP connections and identify payload size issues

**Depends on:** Phase 2 (demonstrates metrics pattern)

**Requirements:** SESS-01, SESS-02, HTTP-01, HTTP-02, HTTP-03, HTTP-04

**Success Criteria** (what must be TRUE):
1. `mcp_active_sessions` gauge reflects current number of active SSE/HTTP connections in real-time
2. Session count increments when client connects and decrements when client disconnects
3. HTTP request latency is tracked in `http_request_duration_seconds` histogram
4. HTTP request count is tracked in `http_requests_total{method, path, status}` counter
5. Request payload sizes are tracked in `mcp_request_size_bytes` histogram
6. Response payload sizes are tracked in `mcp_response_size_bytes` histogram

**Plans:** TBD

---

## Progress Tracking

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Metrics Infrastructure | 0/2 | Planned | - |
| 2. Tool Instrumentation | 0/? | Not started | - |
| 3. Session & Transport Metrics | 0/? | Not started | - |

---

## Coverage

**v1 Requirements:** 19 total
- INFRA: 7 requirements → Phase 1
- TOOL: 6 requirements → Phase 2
- SESS: 2 requirements → Phase 3
- HTTP: 4 requirements → Phase 3

**Mapped:** 19/19 (100%)
**Unmapped:** 0

---

## Phase Dependencies

```
Phase 1: Metrics Infrastructure
  ↓
Phase 2: Tool Instrumentation
  ↓
Phase 3: Session & Transport Metrics
```

**Critical path:** 1 → 2 → 3 (sequential dependencies)

---

## Research Flags

| Phase | Research Needed? | Reason |
|-------|------------------|--------|
| Phase 1 | No | Standard HTTP server pattern, well-documented in prom-client |
| Phase 2 | Maybe | Module resolution depends on existing tool registry structure — verify before implementing |
| Phase 3 | No | Session tracking is straightforward, express-prom-bundle is optional and well-documented |

---

*Roadmap created: 2026-03-19*
*Phase 1 planned: 2026-03-19*
