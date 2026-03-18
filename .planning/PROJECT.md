# Harness MCP Server — Prometheus Metrics

## What This Is

Adding production-grade Prometheus metrics to the Harness MCP TypeScript server's HTTP transport. This gives operational visibility into tool usage patterns, latency, session health, and HTTP transport behavior — mirroring and expanding on the metrics already shipped in the Go-based mcpServerInternal server.

## Core Value

Operators can monitor MCP server health and tool usage in production via standard Prometheus scraping, enabling alerting, dashboards, and SLO tracking.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] `mcp_tool_calls_total` counter with `{tool, module, outcome}` labels (matching Go server)
- [ ] `mcp_tool_call_duration_seconds` histogram with `{tool, module}` labels (p50/p95/p99)
- [ ] `mcp_active_sessions` gauge tracking current SSE/streamable HTTP connections
- [ ] `mcp_request_size_bytes` / `mcp_response_size_bytes` histograms
- [ ] Standard `http_request_duration_seconds` and `http_requests_total` for transport layer
- [ ] Module resolution derived from toolset registry (tool name → module mapping)
- [ ] Dedicated metrics server on configurable port (`HARNESS_METRICS_PORT`, default 9090)
- [ ] `/metrics` endpoint serving Prometheus text format

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
| Separate metrics port (not same HTTP server) | Isolates scraping from MCP protocol traffic; standard practice for sidecar monitoring | — Pending |
| Derive module from toolset registry | Matches Go server pattern; avoids brittle static mapping | — Pending |
| Use prom-client library | De facto standard for Node.js Prometheus metrics | — Pending |
| Configurable via HARNESS_METRICS_PORT | Flexibility for different deployment environments | — Pending |

---
*Last updated: 2026-03-19 after initialization*
