# Harness MCP Server — Prometheus Metrics

## What This Is

Adding production-grade Prometheus metrics to the Harness MCP TypeScript server's HTTP transport. This gives operational visibility into tool usage patterns, latency, session health, and HTTP transport behavior — mirroring and expanding on the metrics already shipped in the Go-based mcpServerInternal server.

## Core Value

Operators can monitor MCP server health and tool usage in production via standard Prometheus scraping, enabling alerting, dashboards, and SLO tracking.

## Requirements

### Validated

- [x] `mcp_tool_calls_total` counter with `{tool, resource_type, module, outcome}` labels — Validated in Phase 2: Tool Instrumentation
- [x] `mcp_tool_call_duration_seconds` histogram with `{tool, resource_type, module}` labels (p50/p95/p99) — Validated in Phase 2: Tool Instrumentation
- [x] Module resolution derived from toolset registry (tool name → module mapping) — Validated in Phase 2: Tool Instrumentation
- [x] Dedicated metrics server on configurable port (`HARNESS_METRICS_PORT`, default 9090) — Validated in Phase 1: Metrics Infrastructure
- [x] `/metrics` endpoint serving Prometheus text format — Validated in Phase 1: Metrics Infrastructure

### Active

- [ ] `mcp_active_sessions` gauge tracking current SSE/streamable HTTP connections
- [ ] `mcp_request_size_bytes` / `mcp_response_size_bytes` histograms
- [ ] Standard `http_request_duration_seconds` and `http_requests_total` for transport layer

### Out of Scope

- Grafana dashboard definitions — operators bring their own dashboards
- Push-based metrics (Pushgateway) — pull model only via /metrics endpoint
- Tracing/spans — separate concern, not part of this work
- Metrics for stdio transport — only HTTP transport gets metrics

## Context

- **Reference implementation:** `mcpServerInternal/pkg/middleware/metrics/tool_metrics.go` (Go) — uses `promauto.NewCounterVec` with `{tool, module, outcome}` labels and `ToolHandlerMiddleware` pattern
- **Module resolution in Go:** `ToolTracker.GetGroupForTool()` → `ModuleRegistry.ToolsetToModule[]` chain
- **This server is TypeScript** using `@modelcontextprotocol/sdk` with Zod 4 schemas — needs a `prom-client` equivalent approach
- **Existing codebase** already has tool registration via a registry pattern (`src/tools/`) that can be extended for module mapping
- **Transport:** Streamable HTTP (remote) + Stdio (local). Metrics only apply to HTTP transport.

## Constraints

- **Library:** Must use `prom-client` (standard Node.js Prometheus client)
- **No stdout pollution:** Metrics server must not interfere with stdio transport — separate HTTP server on dedicated port
- **Label cardinality:** Tool names are bounded by registered tools (~50-100 max). Module names are bounded by Harness modules (~15). Outcome is 3 values. Safe cardinality.
- **Performance:** Metrics collection must add <1ms overhead per tool call

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Separate metrics port (not same HTTP server) | Isolates scraping from MCP protocol traffic; standard practice for sidecar monitoring | ✓ Implemented (Phase 1) |
| Derive module from toolset registry | Matches Go server pattern; avoids brittle static mapping | ✓ Implemented (Phase 2) |
| Use prom-client library | De facto standard for Node.js Prometheus metrics | ✓ Implemented (Phase 1) |
| Configurable via HARNESS_METRICS_PORT | Flexibility for different deployment environments | ✓ Implemented (Phase 1) |

---
*Last updated: 2026-03-19 after Phase 2 (Tool Instrumentation) complete*
