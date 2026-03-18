# Feature Landscape: Prometheus Metrics for MCP Servers

**Domain:** Production observability for TypeScript-based MCP servers (HTTP transport)
**Researched:** 2026-03-19

## Table Stakes

Features users expect for production observability. Missing = product feels incomplete or unsuitable for production.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **RED Method Metrics** | Industry standard for request-based services (Rate, Error, Duration) | Medium | Tool call rate, error rate, latency percentiles (p50/p95/p99) |
| **HTTP Request Duration Histogram** | Foundation for SLO/SLI calculation, latency analysis | Medium | Standard bucketing: 0.005s to 10s, labeled by tool/module/outcome |
| **HTTP Request Counter** | Track total requests by tool and outcome (success/error) | Low | Counter with labels: `{tool, module, outcome}` — matches Go server pattern |
| **Active Sessions Gauge** | Essential for capacity planning, session lifecycle monitoring | Low | Tracks current SSE/streamable HTTP connections |
| **Tool Call Duration Histogram** | Application-level latency beyond HTTP transport | Medium | p50/p95/p99 percentiles for tool execution time |
| **Default Node.js Metrics** | Expected for any Node.js production service | Low | Process CPU, memory, event loop lag, GC stats via prom-client `collectDefaultMetrics()` |
| **Dedicated /metrics Endpoint** | Standard Prometheus exposition format on separate port | Low | Text format, HTTP GET, separate from MCP protocol traffic |
| **Label Cardinality Control** | Prevent cardinality explosion (bounded labels only) | Medium | Tool names (~50-100), modules (~15), outcome (3 values: success/error/timeout) |
| **Counter Naming Convention** | All counters must end with `_total` (Prometheus convention) | Low | Examples: `mcp_tool_calls_total`, `http_requests_total` |
| **Metric Namespace** | Prefix with service name to avoid collisions | Low | Use `mcp_` prefix for MCP-specific metrics, `http_` for HTTP transport |

## Differentiators

Features that set the implementation apart. Not expected, but valued for production deployments.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Module Auto-Resolution** | Derives module label from tool name via toolset registry (pipeline → "ci", service → "cd") | Medium | Mirrors Go server pattern, avoids manual mapping maintenance |
| **Request/Response Size Histograms** | Detect payload bloat, optimize serialization | Medium | Buckets: 100B to 10MB, helps identify inefficient tool responses |
| **Authentication Failure Metrics** | Security visibility: JWT validation failures, expired tokens, invalid API keys | Medium | Counter with labels: `{auth_type, failure_reason}` |
| **Configurable Bucket Boundaries** | Customize histogram buckets per deployment (different latency profiles) | Medium | Env var: `HARNESS_METRICS_BUCKETS_DURATION_MS` |
| **Multi-Window Burn Rate Alerts** | SLO-aware alerting (short + long window required to fire) | High | Google SRE pattern for reducing false positives on latency spikes |
| **Recording Rules for SLI Calculation** | Pre-compute SLI ratios for faster dashboard queries | Medium | Prometheus recording rules compute success ratio over sliding windows (5m, 30m, 24h) |
| **Graceful Degradation Metrics** | Track fallback behavior (cache hits, circuit breaker trips, retries) | Low | Counters: `mcp_cache_hits_total`, `mcp_circuit_breaker_trips_total`, `mcp_retries_total` |
| **Toolset Filtering Metrics** | Track which toolsets are enabled/disabled via HARNESS_TOOLSETS | Low | Gauge: `mcp_toolsets_enabled` with label `{toolset}` |
| **Session Lifecycle Metrics** | Session creation, idle timeout reaps, manual deletions | Low | Counters: `mcp_sessions_created_total`, `mcp_sessions_reaped_total`, `mcp_sessions_deleted_total` |
| **Correlation with Harness API Errors** | Map Harness API error codes to metrics labels for visibility | Medium | Label: `{harness_error_code}` on error outcomes |

## Anti-Features

Features to explicitly NOT build. Either out of scope, premature optimization, or better handled externally.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Grafana Dashboard Definitions** | Dashboards are deployment-specific; operators customize for their needs | Provide example queries/alerts in docs, not hard-coded dashboards |
| **Push-Based Metrics (Pushgateway)** | Adds complexity, not idiomatic for long-running HTTP servers | Pull-only via /metrics endpoint — standard Prometheus scraping |
| **Distributed Tracing (OpenTelemetry Spans)** | Separate concern from metrics; scope creep for initial implementation | Defer to future milestone; focus on metrics first (RED method) |
| **Metrics for Stdio Transport** | Stdio is local/dev use; metrics imply production (HTTP transport only) | Document limitation: metrics only collected for HTTP transport |
| **Per-User/Per-Session Labels** | Causes cardinality explosion (unbounded label values) | Aggregate by tool/module/outcome only, not per-session or per-user |
| **Custom Metric Types Beyond RED** | Premature feature addition without user validation | Start with RED, add domain-specific metrics post-launch if needed |
| **Metrics Persistence/Storage** | Not the server's job — Prometheus handles storage and retention | Server exposes /metrics; Prometheus scrapes and stores |
| **Alerting Rules** | Deployment-specific thresholds vary by environment | Provide example alert rules in docs, not bundled with server |
| **High-Cardinality Labels** | User IDs, request IDs, timestamps, full URLs in labels | Use bounded dimensions: tool names, modules, HTTP status codes, outcome enums |
| **Summaries Instead of Histograms** | Summaries can't be aggregated across instances; histograms preferred | Always use histograms for latency/duration metrics (aggregatable with `histogram_quantile()`) |

## Feature Dependencies

```
RED Method Metrics
  └── HTTP Request Duration Histogram (duration)
  └── HTTP Request Counter (rate)
  └── HTTP Request Counter with outcome=error label (errors)

Tool Call Duration Histogram
  └── Module Auto-Resolution (requires toolset registry lookup)
  └── Label Cardinality Control (bounded tool names)

Authentication Failure Metrics
  └── JWT Middleware (auth context extraction)

Recording Rules for SLI Calculation
  └── HTTP Request Counter (base metric)
  └── Multi-Window Burn Rate Alerts (uses recorded SLI ratios)

Session Lifecycle Metrics
  └── Active Sessions Gauge (tracks current state)
  └── Session creation/deletion counters (track lifecycle events)
```

## MVP Recommendation

Prioritize table stakes for production readiness. Build foundation first, add differentiators based on user feedback.

### Phase 1: Core RED Metrics (Table Stakes)
1. **HTTP Request Duration Histogram** — `http_request_duration_seconds{method, path, status_code}`
2. **HTTP Request Counter** — `http_requests_total{method, path, status_code}`
3. **Tool Call Counter** — `mcp_tool_calls_total{tool, module, outcome}`
4. **Tool Call Duration Histogram** — `mcp_tool_call_duration_seconds{tool, module}`
5. **Active Sessions Gauge** — `mcp_active_sessions`
6. **Default Node.js Metrics** — `process_cpu_seconds_total`, `nodejs_eventloop_lag_seconds`, `nodejs_heap_size_bytes`, etc.
7. **Dedicated /metrics Endpoint** — Separate Express server on `HARNESS_METRICS_PORT` (default 9090)

### Phase 2: Production Hardening (Table Stakes Completion)
8. **Label Cardinality Control** — Bounded tool names, modules (<=100 unique values per label)
9. **Metric Naming Conventions** — `_total` suffix for counters, `mcp_` / `http_` / `nodejs_` prefixes
10. **Request/Response Size Histograms** — `http_request_size_bytes`, `http_response_size_bytes`

### Phase 3: Differentiators (Post-MVP Validation)
11. **Module Auto-Resolution** — Derive module label from toolset registry
12. **Authentication Failure Metrics** — `mcp_auth_failures_total{auth_type, failure_reason}`
13. **Session Lifecycle Metrics** — Creation, reaping, deletion counters
14. **Configurable Bucket Boundaries** — Env var overrides for histogram buckets

### Defer to Future Milestones
- **Recording Rules for SLI Calculation** — Requires Prometheus backend configuration, not server-side
- **Multi-Window Burn Rate Alerts** — Requires Prometheus Alertmanager rules, not server-side
- **Correlation with Harness API Errors** — Add `{harness_error_code}` label once base metrics validated

## Implementation Notes

### Histogram Bucketing Guidance

**Request Duration (HTTP):**
```javascript
// Buckets optimized for API latency: 5ms to 10s
[0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
```

**Tool Call Duration (Application):**
```javascript
// Buckets optimized for tool execution: 50ms to 30s
[0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 20, 30]
```

**Request/Response Size:**
```javascript
// Buckets in bytes: 100B to 10MB
[100, 1000, 10000, 100000, 1000000, 10000000]
```

### Label Best Practices (Cardinality Control)

**Safe Labels (Bounded Cardinality):**
- `tool` — Registered tool names (~50-100 unique values)
- `module` — Harness modules (ci, cd, ccm, sto, chaos, idp, ff — ~15 values)
- `outcome` — Enum: success, error, timeout (3 values)
- `method` — HTTP methods: GET, POST, PUT, DELETE (4 values)
- `status_code` — HTTP status codes (grouped: 2xx, 4xx, 5xx — ~10 values)
- `auth_type` — jwt, api_key (2 values)
- `failure_reason` — Enum: expired, invalid_signature, missing_claims (~5 values)

**Unsafe Labels (Unbounded Cardinality — NEVER USE):**
- ❌ `user_id` — Unbounded (thousands of users)
- ❌ `session_id` — Unbounded (UUIDs)
- ❌ `request_id` — Unbounded (correlation IDs)
- ❌ `org_id` or `project_id` — High cardinality (hundreds to thousands)
- ❌ `timestamp` — Infinite cardinality
- ❌ `url` or `path` with parameters — High cardinality (use route templates instead: `/api/v1/pipelines/:id`)

### prom-client Configuration Pattern

```typescript
import * as promClient from 'prom-client';

// Enable default metrics (CPU, memory, event loop)
promClient.collectDefaultMetrics({ prefix: 'nodejs_' });

// Create custom registry (optional, for isolation)
const register = new promClient.Registry();

// Define histogram with custom buckets
const httpDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'path', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

// Define counter
const toolCalls = new promClient.Counter({
  name: 'mcp_tool_calls_total',
  help: 'Total number of MCP tool calls',
  labelNames: ['tool', 'module', 'outcome'],
  registers: [register],
});

// Define gauge
const activeSessions = new promClient.Gauge({
  name: 'mcp_active_sessions',
  help: 'Number of active MCP sessions',
  registers: [register],
});

// Expose metrics endpoint (separate port)
const metricsApp = express();
metricsApp.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});
metricsApp.listen(config.HARNESS_METRICS_PORT || 9090);
```

### Middleware Integration Pattern

**Express Middleware for HTTP Metrics:**
```typescript
import promBundle from 'express-prom-bundle';

// Configure as FIRST middleware to capture full request duration
const metricsMiddleware = promBundle({
  includeMethod: true,
  includePath: true,
  includeStatusCode: true,
  includeUp: true,
  customLabels: { service: 'harness-mcp-server' },
  promClient: { collectDefaultMetrics: {} },
  // Bypass /metrics endpoint to avoid counting itself
  bypass: (req) => req.path === '/metrics',
});

app.use(metricsMiddleware);
```

**Tool Call Instrumentation:**
```typescript
// In tool handler
const startTime = Date.now();
try {
  const result = await registry.dispatch(client, args.resource_type, "list", args);

  // Success outcome
  const duration = (Date.now() - startTime) / 1000;
  toolCallDuration.observe({ tool: args.resource_type, module: resolveModule(args.resource_type) }, duration);
  toolCalls.inc({ tool: args.resource_type, module: resolveModule(args.resource_type), outcome: 'success' });

  return result;
} catch (error) {
  // Error outcome
  const duration = (Date.now() - startTime) / 1000;
  toolCallDuration.observe({ tool: args.resource_type, module: resolveModule(args.resource_type) }, duration);
  toolCalls.inc({ tool: args.resource_type, module: resolveModule(args.resource_type), outcome: 'error' });

  throw error;
}
```

## Complexity Assessment

| Feature Category | Lines of Code (Est.) | Risk Level | Dependencies |
|------------------|----------------------|------------|--------------|
| HTTP Request Metrics (express-prom-bundle) | ~50 | Low | `express-prom-bundle`, `prom-client` |
| Tool Call Metrics (custom instrumentation) | ~100 | Medium | Registry, toolset definitions |
| Active Sessions Gauge | ~30 | Low | Session manager |
| Default Node.js Metrics | ~10 | Low | `prom-client.collectDefaultMetrics()` |
| Module Auto-Resolution | ~50 | Medium | Toolset registry refactor |
| Authentication Failure Metrics | ~40 | Low | JWT middleware |
| Request/Response Size Histograms | ~60 | Medium | Express middleware with content-length tracking |
| Configurable Buckets | ~30 | Low | Config schema extension |

**Total Estimated LOC:** ~370 lines (excluding tests)
**Implementation Time:** 2-3 days for table stakes (phases 1-2), +1 day for differentiators (phase 3)

## Sources

### RED Method & Observability Fundamentals
- [RED Metrics & Monitoring: Using Rate, Errors, and Duration | Splunk](https://www.splunk.com/en_us/blog/learn/red-monitoring.html)
- [RED and USE Metrics for Monitoring and Observability | Better Stack Community](https://betterstack.com/community/guides/monitoring/red-use-metrics/)
- [How to Build a Grafana RED Metrics Dashboard from OpenTelemetry Span Metrics](https://oneuptime.com/blog/post/2026-02-06-grafana-red-metrics-dashboard-opentelemetry/view)
- [Prometheus & Grafana: The Complete Monitoring Guide for 2026 | DevToolbox Blog](https://devtoolbox.dedyn.io/blog/prometheus-grafana-complete-guide)
- [The Ultimate Guide to API Monitoring in 2026 | SigNoz](https://signoz.io/blog/api-monitoring-complete-guide/)

### Node.js & prom-client Implementation
- [prom-client - npm](https://www.npmjs.com/package/prom-client)
- [How to Add Custom Metrics to Node.js Applications with Prometheus](https://oneuptime.com/blog/post/2026-01-06-nodejs-custom-metrics-prometheus/view)
- [Node.js Performance Monitoring with Prometheus - RisingStack Engineering](https://blog.risingstack.com/node-js-performance-monitoring-with-prometheus/)
- [express-prom-bundle - Middleware with Prometheus Metrics](https://www.npmjs.com/package/express-prom-bundle)
- [Monitoring Node.js: Key Metrics You Should Track | Last9](https://last9.io/blog/node-js-key-metrics/)

### Prometheus Metric Types & Best Practices
- [Prometheus Metric Types (Counters, Gauges, Histograms, Summaries)](https://openobserve.ai/blog/prometheus-metrics-types/)
- [Understanding metric types | Prometheus](https://prometheus.io/docs/tutorials/understanding_metric_types/)
- [Prometheus Gauges vs Counters: What to Use and When | Last9](https://last9.io/blog/prometheus-gauges-vs-counters/)
- [Prometheus Best Practices: 8 Dos and Don'ts | Better Stack Community](https://betterstack.com/community/guides/monitoring/prometheus-best-practices/)

### Percentiles & Histogram Configuration
- [P50 vs P95 vs P99 Latency Explained: What Each Percentile Tells You](https://oneuptime.com/blog/post/2025-09-15-p50-vs-p95-vs-p99-latency-percentiles/view)
- [How to Define and Enforce Performance Budgets Using OpenTelemetry P50/P95/P99 Latency Histograms](https://oneuptime.com/blog/post/2026-02-06-otel-performance-budgets-latency-histograms/view)
- [How to Create Percentile Metrics](https://oneuptime.com/blog/post/2026-01-30-percentile-metrics/view)
- [How to Use Histograms and Summaries in Prometheus](https://oneuptime.com/blog/post/2026-01-26-prometheus-histograms-summaries/view)

### Cardinality Management
- [How to Create Prometheus Label Best Practices](https://oneuptime.com/blog/post/2026-01-30-prometheus-label-best-practices/view)
- [How to Manage Metric Cardinality in Prometheus](https://oneuptime.com/blog/post/2026-01-25-prometheus-metric-cardinality/view)
- [Prometheus Label cardinality explosion - Stack Diagnosis](https://drdroid.io/stack-diagnosis/prometheus-label-cardinality-explosion)
- [How to manage high cardinality metrics in Prometheus and Kubernetes | Grafana Labs](https://grafana.com/blog/how-to-manage-high-cardinality-metrics-in-prometheus-and-kubernetes/)

### Session & Authentication Metrics
- [How to Implement Gauge Metrics Design](https://oneuptime.com/blog/post/2026-01-30-gauge-metrics-design/view)
- [How to Monitor JWT Token Validation Failures and Expired Session Events with OpenTelemetry](https://oneuptime.com/blog/post/2026-02-06-monitor-jwt-validation-failures-opentelemetry/view)
- [How to Implement User Session Tracking with OpenTelemetry Browser SDK](https://oneuptime.com/blog/post/2026-02-06-user-session-tracking-opentelemetry-browser-sdk/view)

### SLO/SLI & Error Budgets
- [How to Create an SLO Status Dashboard with Error Budget Burn Rate Visualization](https://oneuptime.com/blog/post/2026-02-06-slo-error-budget-burn-rate-grafana/view)
- [How to Implement SLO Monitoring with Prometheus](https://oneuptime.com/blog/post/2026-01-25-prometheus-slo-monitoring/view)
- [SRE Guide to SLOs, SLIs, and Error Budgets: A Production Playbook | BackendBytes](https://backendbytes.com/articles/sre-slos-slis-error-budgets/)
- [Google SRE - Prometheus Alerting: Turn SLOs into Alerts](https://sre.google/workbook/alerting-on-slos/)

### MCP Server Observability
- [MCP Server Observability: Monitoring, Testing & Performance Metrics | Zeo](https://zeo.org/resources/blog/mcp-server-observability-monitoring-testing-performance-metrics)
- [MCP Observability | Grafana Cloud documentation](https://grafana.com/docs/grafana-cloud/monitor-applications/ai-observability/mcp-observability/)
- [Datadog MCP server delivers live observability to AI agents and IDEs - Help Net Security](https://www.helpnetsecurity.com/2026/03/10/datadog-mcp-server/)

### Security & Endpoint Configuration
- [Securing Prometheus API and UI endpoints using basic auth | Prometheus](https://prometheus.io/docs/guides/basic-auth/)
- [How to Set Up and Secure Prometheus Metrics Endpoints | SigNoz](https://signoz.io/guides/prometheus-metrics-endpoint/)
- [Prometheus Scraping: Efficient Data Collection in 2026](https://www.groundcover.com/learn/observability/prometheus-scraping)

### Request/Response Size Metrics
- [Istio / Istio Standard Metrics](https://istio.io/latest/docs/reference/config/metrics/)
- [How to Build Size Metrics](https://oneuptime.com/blog/post/2026-01-30-size-metrics/view)
- [Semantic conventions for HTTP metrics | OpenTelemetry](https://opentelemetry.io/docs/specs/semconv/http/http-metrics/)

### Anti-Patterns
- [Common Anti-Patterns In Defining Metrics (And How To Avoid Them) | Xebia](https://xebia.com/articles/common-anti-patterns-in-defining-metrics-and-how-to-avoid-them/)
- [How to Implement Prometheus Counter Best Practices](https://oneuptime.com/blog/post/2026-01-30-prometheus-counter-best-practices/view)
- [Three pesky observability anti-patterns that impact developer efficiency | Chronosphere](https://chronosphere.io/learn/three-pesky-observability-anti-patterns-that-impact-developer-efficiency/)

### OpenTelemetry vs Prometheus
- [OpenTelemetry vs Prometheus - Key Differences Explained | SigNoz](https://signoz.io/blog/opentelemetry-vs-prometheus/)
- [How to Compare OpenTelemetry Metrics vs Prometheus Native Metrics](https://oneuptime.com/blog/post/2026-02-06-compare-opentelemetry-metrics-vs-prometheus-native/view)
- [Prometheus and OpenTelemetry - Better Together | OpenTelemetry](https://opentelemetry.io/blog/2024/prom-and-otel/)
