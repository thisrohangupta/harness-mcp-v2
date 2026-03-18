# Requirements: Harness MCP Server — Prometheus Metrics

**Defined:** 2026-03-19
**Core Value:** Operators can monitor MCP server health and tool usage in production via standard Prometheus scraping

## v1 Requirements

### Metrics Infrastructure

- [x] **INFRA-01**: Dedicated metrics HTTP server runs on a separate configurable port (default 9090)
- [x] **INFRA-02**: Metrics port is configurable via `HARNESS_METRICS_PORT` env var
- [x] **INFRA-03**: Metrics server can be enabled/disabled via `HARNESS_METRICS_ENABLED` env var
- [x] **INFRA-04**: `/metrics` endpoint serves Prometheus text exposition format
- [x] **INFRA-05**: Custom prom-client Registry instance (isolated from global registry)
- [x] **INFRA-06**: Health check endpoint on metrics server (`/healthz` returns 200)
- [x] **INFRA-07**: Metrics server shuts down gracefully when main server stops

### Tool Call Metrics

- [x] **TOOL-01**: `mcp_tool_calls_total` counter tracks tool invocations with `{tool, module, outcome}` labels
- [x] **TOOL-02**: Outcome label classifies as `ok`, `tool_error`, or `error` (matching Go server schema)
- [x] **TOOL-03**: `mcp_tool_call_duration_seconds` histogram tracks tool call latency with `{tool, module}` labels
- [x] **TOOL-04**: Module label is derived from toolset registry (tool name → toolset → module mapping)
- [x] **TOOL-05**: Metrics collection is implemented as middleware wrapper (automatic, no per-tool modification)
- [x] **TOOL-06**: Histogram uses sensible default buckets for API latency (e.g., 0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5 seconds)

### Session & Transport Metrics

- [x] **SESS-01**: `mcp_active_sessions` gauge tracks current SSE/streamable HTTP connections
- [x] **SESS-02**: Session gauge increments on connect and decrements on disconnect/close
- [x] **HTTP-01**: `http_request_duration_seconds` histogram tracks transport-layer HTTP latency
- [x] **HTTP-02**: `http_requests_total` counter tracks HTTP requests by method, path, and status code
- [x] **HTTP-03**: `mcp_request_size_bytes` histogram tracks incoming request payload sizes
- [x] **HTTP-04**: `mcp_response_size_bytes` histogram tracks outgoing response payload sizes

## v2 Requirements

### Runtime Metrics

- **RUNTIME-01**: Node.js default metrics via `collectDefaultMetrics()` (event loop lag, GC, memory)
- **RUNTIME-02**: Configurable via `HARNESS_METRICS_DEFAULT_METRICS` env var
- **RUNTIME-03**: Custom histogram buckets for GC duration (1ms, 10ms, 100ms, 1s, 5s)

### Advanced

- **ADV-01**: Configurable histogram bucket boundaries via env var
- **ADV-02**: Authentication failure metrics (JWT validation errors by type)
- **ADV-03**: Toolset enablement gauge (`mcp_toolsets_enabled{toolset}`)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Grafana dashboard definitions | Operators bring their own dashboards |
| Push-based metrics (Pushgateway) | Pull model only via /metrics endpoint |
| Tracing/spans (OpenTelemetry) | Separate concern, not part of this work |
| Metrics for stdio transport | Only HTTP transport gets metrics server |
| Alerting rules (Alertmanager) | Deployment-specific, not server-side |
| Recording rules for SLI calculation | Prometheus backend config, not server-side |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| INFRA-01 | Phase 1 | Pending |
| INFRA-02 | Phase 1 | Complete |
| INFRA-03 | Phase 1 | Complete |
| INFRA-04 | Phase 1 | Pending |
| INFRA-05 | Phase 1 | Complete |
| INFRA-06 | Phase 1 | Pending |
| INFRA-07 | Phase 1 | Pending |
| TOOL-01 | Phase 2 | Complete |
| TOOL-02 | Phase 2 | Complete |
| TOOL-03 | Phase 2 | Complete |
| TOOL-04 | Phase 2 | Complete |
| TOOL-05 | Phase 2 | Complete |
| TOOL-06 | Phase 2 | Complete |
| SESS-01 | Phase 3 | Complete |
| SESS-02 | Phase 3 | Complete |
| HTTP-01 | Phase 3 | Complete |
| HTTP-02 | Phase 3 | Complete |
| HTTP-03 | Phase 3 | Complete |
| HTTP-04 | Phase 3 | Complete |

**Coverage:**
- v1 requirements: 19 total
- Mapped to phases: 19
- Unmapped: 0
- Coverage: 100%

**Phase breakdown:**
- Phase 1 (Metrics Infrastructure): 7 requirements
- Phase 2 (Tool Instrumentation): 6 requirements
- Phase 3 (Session & Transport Metrics): 6 requirements

---
*Requirements defined: 2026-03-19*
*Last updated: 2026-03-19 after roadmap creation*
