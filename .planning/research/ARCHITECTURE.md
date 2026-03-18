# Architecture Patterns: Prometheus Metrics in TypeScript MCP Server

**Domain:** Observability & Metrics for Model Context Protocol (MCP) Servers
**Researched:** 2026-03-19
**Overall Confidence:** HIGH

## Recommended Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│ MCP Server Process (Node.js)                                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌────────────────┐          ┌──────────────────┐              │
│  │ HTTP Transport │          │ Metrics Server   │              │
│  │ (Port 3000)    │◄─────────│ (Port 9090)      │              │
│  │                │          │ GET /metrics     │              │
│  │ POST /mcp      │          │                  │              │
│  │ GET /mcp (SSE) │          │ Custom Registry  │              │
│  └────────┬───────┘          └────────▲─────────┘              │
│           │                           │                         │
│           │                           │                         │
│  ┌────────▼───────────────────────────┴─────────┐              │
│  │         MCP Server Instance                  │              │
│  │  ┌──────────────────────────────────────┐   │              │
│  │  │      Tool Execution Layer            │   │              │
│  │  │                                       │   │              │
│  │  │  ┌─────────────────────────────┐    │   │              │
│  │  │  │ Tool Handler Wrapper        │    │   │              │
│  │  │  │ (Metrics Middleware)        │    │   │              │
│  │  │  │                              │    │   │              │
│  │  │  │ Before: Start timer         │    │   │              │
│  │  │  │ Execute: Original handler   │────┼───┼──► Increment │
│  │  │  │ After:  Record metrics      │    │   │    Counters  │
│  │  │  │         - duration          │────┼───┼──► Update    │
│  │  │  │         - outcome           │    │   │    Histograms│
│  │  │  └─────────────────────────────┘    │   │              │
│  │  │                                       │   │              │
│  │  └───────────────────────────────────────┘   │              │
│  │                                               │              │
│  │  ┌──────────────────────────────────────┐   │              │
│  │  │    Module Resolution Layer           │   │              │
│  │  │  (Toolset Registry → Module Mapping) │   │              │
│  │  └──────────────────────────────────────┘   │              │
│  └───────────────────────────────────────────────┘              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                                │
                                │ scrape /metrics
                                ▼
                        ┌──────────────┐
                        │  Prometheus  │
                        │   Server     │
                        └──────────────┘
```

### Component Boundaries

| Component | Responsibility | Communicates With | State |
|-----------|---------------|-------------------|-------|
| **Metrics Server** | Expose /metrics endpoint on separate port, serve Prometheus text format | Prometheus (external), Metrics Registry (read) | Stateless — registry holds all state |
| **Metrics Registry** | Store all metric instances (counters, histograms, gauges), provide .metrics() output | Tool Wrapper (writes), Metrics Server (reads) | Stateful — accumulates time series data |
| **Tool Handler Wrapper** | Intercept tool execution, measure latency, increment counters, derive module label | Original tool handler, Metrics Registry, Module Resolver | Stateless — wrapper logic only |
| **Module Resolver** | Map tool name → module name using toolset registry | Tool Wrapper, Toolset Registry | Stateless — reads from registry |
| **Toolset Registry** | Existing registry mapping tools to domains | Module Resolver | Stateful — loaded at startup |
| **HTTP Transport** | Serve MCP protocol requests | MCP Server (delegate), Tool Wrapper (indirectly) | Stateful — session management |

## Data Flow

### Metrics Collection Flow (Tool Call Path)

```
1. Agent sends tool call
        │
        ▼
2. HTTP Transport routes to MCP Server
        │
        ▼
3. MCP Server dispatches to tool handler
        │
        ▼
4. Tool Handler Wrapper intercepts
        │
        ├─→ Start timer (Date.now())
        ├─→ Resolve module name from tool name
        ├─→ Increment mcp_tool_calls_total{tool, module, outcome="in_progress"}
        │
        ▼
5. Execute original tool handler
        │
        ├─→ Success path
        │   ├─→ Stop timer, calculate duration
        │   ├─→ Increment mcp_tool_calls_total{tool, module, outcome="success"}
        │   ├─→ Observe mcp_tool_call_duration_seconds{tool, module}
        │   └─→ Return result
        │
        └─→ Error path
            ├─→ Stop timer, calculate duration
            ├─→ Increment mcp_tool_calls_total{tool, module, outcome="error"}
            ├─→ Observe mcp_tool_call_duration_seconds{tool, module}
            └─→ Throw/return error
```

### Metrics Scraping Flow

```
1. Prometheus scrapes GET http://mcp-server:9090/metrics
        │
        ▼
2. Metrics Server receives request
        │
        ▼
3. Metrics Server calls registry.metrics()
        │
        ▼
4. Registry serializes all time series to Prometheus text format
        │
        ├─→ # HELP mcp_tool_calls_total Total number of MCP tool calls
        ├─→ # TYPE mcp_tool_calls_total counter
        ├─→ mcp_tool_calls_total{tool="harness_list",module="pipelines",outcome="success"} 42
        ├─→ mcp_tool_calls_total{tool="harness_get",module="services",outcome="success"} 17
        │
        ├─→ # HELP mcp_tool_call_duration_seconds Duration of MCP tool calls
        ├─→ # TYPE mcp_tool_call_duration_seconds histogram
        ├─→ mcp_tool_call_duration_seconds_bucket{tool="harness_list",module="pipelines",le="0.01"} 5
        ├─→ mcp_tool_call_duration_seconds_bucket{tool="harness_list",module="pipelines",le="0.05"} 30
        ├─→ mcp_tool_call_duration_seconds_bucket{tool="harness_list",module="pipelines",le="+Inf"} 42
        │
        └─→ ... (more metrics)
        │
        ▼
5. Return text/plain response to Prometheus
```

### Module Resolution Flow

```
1. Tool name provided (e.g., "harness_list")
        │
        ▼
2. Tool wrapper extracts resource_type from args (e.g., "pipeline")
        │
        ▼
3. Module Resolver queries Toolset Registry
        │
        ├─→ Find toolset containing resource_type "pipeline"
        ├─→ Toolset found: pipelinesToolset
        └─→ Return module name: "pipelines"
        │
        ▼
4. Use module name as label: {module="pipelines"}
```

**Fallback:** If resource_type not found or generic tool, label as `{module="unknown"}`

## Patterns to Follow

### Pattern 1: Tool Handler Wrapper (Middleware)

**What:** Wrap every MCP tool handler with metrics instrumentation using higher-order function pattern.

**When:** During tool registration in `src/tools/index.ts`

**Why:** Non-invasive, zero changes to existing tool code, centralizes metrics logic

**Example:**
```typescript
import * as promClient from 'prom-client';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

// Metric definitions
const toolCallsTotal = new promClient.Counter({
  name: 'mcp_tool_calls_total',
  help: 'Total number of MCP tool calls',
  labelNames: ['tool', 'module', 'outcome'] as const,
  registers: [metricsRegistry], // custom registry, not global
});

const toolCallDuration = new promClient.Histogram({
  name: 'mcp_tool_call_duration_seconds',
  help: 'Duration of MCP tool calls in seconds',
  labelNames: ['tool', 'module'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10], // default web app buckets
  registers: [metricsRegistry],
});

// Wrapper function
function wrapToolHandler(
  toolName: string,
  originalHandler: (args: unknown) => Promise<CallToolResult>,
  moduleResolver: (args: unknown) => string
): (args: unknown) => Promise<CallToolResult> {
  return async (args: unknown): Promise<CallToolResult> => {
    const startTime = Date.now();
    const moduleName = moduleResolver(args);

    try {
      const result = await originalHandler(args);

      // Success path
      const durationSeconds = (Date.now() - startTime) / 1000;
      toolCallsTotal.inc({ tool: toolName, module: moduleName, outcome: 'success' });
      toolCallDuration.observe({ tool: toolName, module: moduleName }, durationSeconds);

      return result;
    } catch (error) {
      // Error path
      const durationSeconds = (Date.now() - startTime) / 1000;
      toolCallsTotal.inc({ tool: toolName, module: moduleName, outcome: 'error' });
      toolCallDuration.observe({ tool: toolName, module: moduleName }, durationSeconds);

      throw error; // re-throw to preserve error handling
    }
  };
}

// Usage during tool registration
server.registerTool(
  "harness_list",
  { description: "...", inputSchema: {...} },
  wrapToolHandler(
    "harness_list",
    async (args) => { /* original handler */ },
    (args) => resolveModule(args.resource_type) // module resolver
  )
);
```

### Pattern 2: Separate Metrics Server (Dedicated Port)

**What:** Run a second Express app on a different port (9090) solely for Prometheus scraping.

**When:** At server startup, parallel to main HTTP transport

**Why:** Isolates monitoring traffic from MCP protocol traffic, follows Prometheus best practices, enables firewall rules (internal-only metrics port)

**Example:**
```typescript
import express from 'express';
import * as promClient from 'prom-client';

// Create custom registry (NOT global registry)
const metricsRegistry = new promClient.Registry();

// Metrics server (separate from MCP server)
const metricsApp = express();

metricsApp.get('/metrics', async (req, res) => {
  res.setHeader('Content-Type', metricsRegistry.contentType);
  const metrics = await metricsRegistry.metrics();
  res.send(metrics);
});

metricsApp.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

const metricsPort = config.HARNESS_METRICS_PORT || 9090;
metricsApp.listen(metricsPort, () => {
  console.error(`[metrics] Prometheus metrics exposed on port ${metricsPort}`);
});
```

### Pattern 3: Custom Registry (Not Global)

**What:** Create a dedicated `Registry` instance for MCP metrics, separate from prom-client's global registry.

**When:** At module initialization before defining any metrics

**Why:** Prevents pollution from other libraries using global registry, enables selective metric exposure, allows merging with other registries if needed

**Example:**
```typescript
import * as promClient from 'prom-client';

// Custom registry — do NOT use promClient.register (global)
export const metricsRegistry = new promClient.Registry();

// All metrics MUST specify registers: [metricsRegistry]
const counter = new promClient.Counter({
  name: 'mcp_tool_calls_total',
  help: 'Total MCP tool calls',
  labelNames: ['tool', 'module', 'outcome'] as const,
  registers: [metricsRegistry], // CRITICAL — omit this and it goes to global registry
});
```

**Warning:** Forgetting `registers: [metricsRegistry]` will register metric to global registry, causing metrics to leak into other libraries' output.

### Pattern 4: Module Resolution via Toolset Registry

**What:** Derive `module` label dynamically from toolset registry based on `resource_type` parameter.

**When:** Inside tool wrapper before recording metrics

**Why:** Matches Go server pattern, avoids brittle static mapping, reuses existing registry data structure

**Example:**
```typescript
// src/metrics/module-resolver.ts
import { Registry } from '../registry/index.js';

export function createModuleResolver(registry: Registry) {
  return (args: unknown): string => {
    // Extract resource_type from tool args
    const resourceType = (args as { resource_type?: string }).resource_type;

    if (!resourceType) {
      return 'unknown';
    }

    // Find toolset containing this resource_type
    const toolset = registry.findToolsetByResource(resourceType);

    return toolset?.name || 'unknown';
  };
}

// Usage
const resolveModule = createModuleResolver(registry);
const moduleName = resolveModule({ resource_type: 'pipeline' }); // → "pipelines"
```

### Pattern 5: Label Cardinality Management

**What:** Keep label cardinality bounded to prevent Prometheus performance issues.

**When:** Designing metric label sets

**Why:** Each unique label combination creates a new time series; unbounded labels (user IDs, timestamps) cause exponential cardinality explosion

**Safe Labels (Low Cardinality):**
- `tool` — bounded by registered tools (~11 tools)
- `module` — bounded by Harness modules (~27 toolsets)
- `outcome` — bounded to `{success, error}` (2 values)
- `method` — bounded to HTTP methods `{GET, POST, PUT, DELETE}` (4 values)
- `status_code` — bounded to HTTP status codes (~20 common values)

**Unsafe Labels (High Cardinality — NEVER USE):**
- `user_id`, `session_id`, `request_id` — unbounded
- `org_id`, `project_id` — potentially thousands of values
- `pipeline_id`, `service_id` — unbounded
- `error_message` — unbounded

**Cardinality Calculation:**
- `tool` (11) × `module` (27) × `outcome` (2) = **594 time series** ✅ SAFE
- Adding `org_id` (1000 orgs) = 594,000 time series ❌ DANGER

**Best Practice:** If you need to track per-org metrics, use separate aggregation job or exemplars, NOT labels.

### Pattern 6: Histogram Bucket Design for Latency

**What:** Configure histogram buckets aligned with SLO thresholds for p50/p95/p99 calculations.

**When:** Defining duration histograms

**Why:** Proper buckets enable accurate percentile queries; too few buckets = poor resolution, too many = storage bloat

**Recommended Buckets for MCP Tool Latency:**
```typescript
const toolCallDuration = new promClient.Histogram({
  name: 'mcp_tool_call_duration_seconds',
  help: 'Duration of MCP tool calls in seconds',
  labelNames: ['tool', 'module'] as const,
  buckets: [
    0.005,  // 5ms   — very fast tools (cache hits)
    0.01,   // 10ms  — fast tools (simple queries)
    0.025,  // 25ms  — moderate tools
    0.05,   // 50ms  — p50 target (typical SLO)
    0.1,    // 100ms — slower tools (list operations)
    0.25,   // 250ms
    0.5,    // 500ms — p95 target
    1,      // 1s    — p99 target
    2.5,    // 2.5s  — slow operations (execution start)
    5,      // 5s    — very slow (log retrieval)
    10,     // 10s   — outliers
  ],
  registers: [metricsRegistry],
});
```

**Rationale:**
- **0.005-0.05s range:** Captures fast operations (GET, list with filters)
- **0.05-0.5s range:** Typical API calls to Harness (includes network latency)
- **0.5-5s range:** Slow operations (pipeline execution start, large log downloads)
- **5-10s range:** Outliers (useful for debugging, but should be rare)

**Querying Percentiles:**
```promql
# p50 (median)
histogram_quantile(0.50, sum(rate(mcp_tool_call_duration_seconds_bucket[5m])) by (le, tool))

# p95
histogram_quantile(0.95, sum(rate(mcp_tool_call_duration_seconds_bucket[5m])) by (le, tool))

# p99
histogram_quantile(0.99, sum(rate(mcp_tool_call_duration_seconds_bucket[5m])) by (le, tool))
```

## Anti-Patterns to Avoid

### Anti-Pattern 1: Using Global Registry

**What:** Relying on `promClient.register` (global singleton) instead of custom registry.

**Why bad:** Global registry gets polluted by other libraries (if any dependency uses prom-client), hard to test (shared state), violates separation of concerns.

**Instead:** Always create `new promClient.Registry()` and pass `registers: [customRegistry]` to every metric.

**Detection:** Grep for `promClient.register.metrics()` — should only appear in legacy code or tests.

### Anti-Pattern 2: Metrics in Tool Implementation

**What:** Adding `counter.inc()` calls inside individual tool files (e.g., `harness-list.ts`).

**Why bad:** Duplicates instrumentation logic across 11+ tools, easy to forget, couples tools to metrics library, hard to change metric schema later.

**Instead:** Use wrapper pattern — centralize all metrics logic in one place (`src/metrics/wrapper.ts`).

### Anti-Pattern 3: High-Cardinality Labels

**What:** Adding `org_id`, `project_id`, `pipeline_id`, or other unbounded identifiers as labels.

**Why bad:** Creates thousands or millions of time series, exhausts Prometheus memory, slows queries to crawl, causes scrape timeouts.

**Instead:** Use fixed labels (`tool`, `module`, `outcome`) and aggregate in application layer if per-entity metrics needed.

**Example of Bad Label:**
```typescript
// ❌ DANGER — unbounded label
toolCallsTotal.inc({ tool: 'harness_list', org_id: req.org_id });
```

**Example of Good Alternative:**
```typescript
// ✅ SAFE — bounded label, separate aggregation for org-level stats
toolCallsTotal.inc({ tool: 'harness_list', module: 'pipelines' });

// If org-level stats needed, use separate counter with lower retention
orgToolCallsTotal.inc({ org_id: req.org_id }); // stored separately with 1-day retention
```

### Anti-Pattern 4: Blocking Metrics Collection

**What:** Making metrics collection synchronous or blocking the request path.

**Why bad:** Adds latency to every tool call, defeats the purpose of async Node.js, can cause timeouts.

**Instead:** Metrics should be fire-and-forget — `counter.inc()` and `histogram.observe()` are synchronous but fast (in-memory only).

**Safe:**
```typescript
toolCallsTotal.inc({ tool, module, outcome: 'success' }); // < 1μs, safe
```

**Unsafe:**
```typescript
await sendMetricsToRemoteSystem(metrics); // blocks request ❌
```

### Anti-Pattern 5: Running Metrics on Same Port as MCP Server

**What:** Serving `/metrics` on the same Express app/port as the MCP protocol.

**Why bad:** Exposes internal metrics to public internet (if MCP server is public), mixes monitoring traffic with application traffic, harder to firewall.

**Instead:** Always use separate port (9090) for metrics, keep it internal-only.

**Detection:** Check if `/metrics` route added to main HTTP transport — should be on separate Express app.

### Anti-Pattern 6: Not Handling Tool Errors in Wrapper

**What:** Forgetting to record metrics in error path, or letting exceptions escape wrapper.

**Why bad:** Skews success rate metrics (errors not counted), breaks wrapper chain (metrics lost), misleading dashboards.

**Instead:** Wrap in try/catch, record metrics in both success and error paths, re-throw error to preserve behavior.

**Example:**
```typescript
// ❌ BAD — errors not counted
async function wrapper(handler) {
  const start = Date.now();
  const result = await handler(); // if this throws, metrics never recorded
  toolCallDuration.observe((Date.now() - start) / 1000);
  return result;
}

// ✅ GOOD — errors counted
async function wrapper(handler) {
  const start = Date.now();
  try {
    const result = await handler();
    toolCallsTotal.inc({ outcome: 'success' });
    toolCallDuration.observe((Date.now() - start) / 1000);
    return result;
  } catch (error) {
    toolCallsTotal.inc({ outcome: 'error' });
    toolCallDuration.observe((Date.now() - start) / 1000);
    throw error; // re-throw to preserve error handling
  }
}
```

## Scalability Considerations

### At 10 Concurrent Sessions (Typical Dev Environment)

| Concern | Approach | Notes |
|---------|----------|-------|
| Time series count | 594 series (11 tools × 27 modules × 2 outcomes) | Safe — well under 10K limit |
| Memory usage | ~5 MB for metrics data | Negligible |
| Scrape latency | <50ms per scrape | Fast enough for 15s scrape interval |
| Label cardinality | Low — all labels bounded | No risk |

### At 100 Concurrent Sessions (Production)

| Concern | Approach | Notes |
|---------|----------|-------|
| Time series count | Still 594 series (labels don't include session) | Safe |
| Memory usage | ~10-15 MB (slightly more histogram data) | Still negligible |
| Scrape latency | <100ms per scrape | Fast |
| HTTP metrics | Add `http_requests_total` with `{method, status_code}` | ~20 additional series |

### At 1000+ Concurrent Sessions (Large Enterprise)

| Concern | Approach | Notes |
|---------|----------|-------|
| Time series count | Still <1K series (no session-level labels) | Safe |
| Memory usage | ~50-100 MB (more histogram buckets with data) | Acceptable |
| Scrape latency | <200ms per scrape | May need tuning |
| Metrics server CPU | Consider caching `registry.metrics()` for 5s | Reduce serialization overhead |

**Key Insight:** Metrics cardinality does NOT grow with session count because labels are bounded to tool/module/outcome. Memory growth is sublinear.

**If Scraping Becomes Slow (>500ms):**
1. Cache `registry.metrics()` output for 5-10 seconds (trade freshness for speed)
2. Reduce histogram bucket count (from 11 to 7 buckets)
3. Enable OpenMetrics format (more efficient than Prometheus text format)

## Key Abstractions

### 1. MetricsCollector

**Purpose:** Central class owning all metric instances (counters, histograms, gauges) and registry.

**Pattern:**
```typescript
// src/metrics/collector.ts
import * as promClient from 'prom-client';

export class MetricsCollector {
  private registry: promClient.Registry;
  private toolCallsTotal: promClient.Counter;
  private toolCallDuration: promClient.Histogram;
  private activeSessions: promClient.Gauge;

  constructor() {
    this.registry = new promClient.Registry();

    this.toolCallsTotal = new promClient.Counter({
      name: 'mcp_tool_calls_total',
      help: 'Total number of MCP tool calls',
      labelNames: ['tool', 'module', 'outcome'] as const,
      registers: [this.registry],
    });

    this.toolCallDuration = new promClient.Histogram({
      name: 'mcp_tool_call_duration_seconds',
      help: 'Duration of MCP tool calls in seconds',
      labelNames: ['tool', 'module'] as const,
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [this.registry],
    });

    this.activeSessions = new promClient.Gauge({
      name: 'mcp_active_sessions',
      help: 'Current number of active MCP sessions',
      registers: [this.registry],
    });
  }

  recordToolCall(tool: string, module: string, outcome: 'success' | 'error'): void {
    this.toolCallsTotal.inc({ tool, module, outcome });
  }

  recordToolDuration(tool: string, module: string, durationSeconds: number): void {
    this.toolCallDuration.observe({ tool, module }, durationSeconds);
  }

  incrementActiveSessions(): void {
    this.activeSessions.inc();
  }

  decrementActiveSessions(): void {
    this.activeSessions.dec();
  }

  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }
}
```

### 2. ToolWrapper

**Purpose:** Higher-order function that wraps tool handlers with metrics instrumentation.

**Pattern:**
```typescript
// src/metrics/wrapper.ts
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { MetricsCollector } from './collector.js';

export type ToolHandler = (args: unknown) => Promise<CallToolResult>;
export type ModuleResolver = (args: unknown) => string;

export function createToolWrapper(
  metrics: MetricsCollector,
  moduleResolver: ModuleResolver
) {
  return function wrapTool(
    toolName: string,
    handler: ToolHandler
  ): ToolHandler {
    return async (args: unknown): Promise<CallToolResult> => {
      const startTime = Date.now();
      const moduleName = moduleResolver(args);

      try {
        const result = await handler(args);

        const durationSeconds = (Date.now() - startTime) / 1000;
        metrics.recordToolCall(toolName, moduleName, 'success');
        metrics.recordToolDuration(toolName, moduleName, durationSeconds);

        return result;
      } catch (error) {
        const durationSeconds = (Date.now() - startTime) / 1000;
        metrics.recordToolCall(toolName, moduleName, 'error');
        metrics.recordToolDuration(toolName, moduleName, durationSeconds);

        throw error;
      }
    };
  };
}
```

### 3. ModuleResolver

**Purpose:** Map tool arguments (specifically `resource_type`) to module name for labels.

**Pattern:**
```typescript
// src/metrics/module-resolver.ts
import { Registry } from '../registry/index.js';

export function createModuleResolver(registry: Registry) {
  // Pre-build resource_type → module mapping for O(1) lookup
  const resourceToModule = new Map<string, string>();

  for (const toolset of registry.getAllToolsets()) {
    for (const resource of toolset.resources) {
      resourceToModule.set(resource.resourceType, toolset.name);
    }
  }

  return (args: unknown): string => {
    const resourceType = (args as { resource_type?: string }).resource_type;

    if (!resourceType) {
      return 'unknown';
    }

    return resourceToModule.get(resourceType) || 'unknown';
  };
}
```

### 4. MetricsServer

**Purpose:** Standalone Express app serving `/metrics` endpoint on dedicated port.

**Pattern:**
```typescript
// src/metrics/server.ts
import express from 'express';
import { MetricsCollector } from './collector.js';
import { Config } from '../config.js';

export function createMetricsServer(
  metrics: MetricsCollector,
  config: Config
): express.Application {
  const app = express();

  // GET /metrics — Prometheus scrape endpoint
  app.get('/metrics', async (req, res) => {
    try {
      const metricsOutput = await metrics.getMetrics();
      res.setHeader('Content-Type', metrics.registry.contentType);
      res.send(metricsOutput);
    } catch (error) {
      console.error('[metrics] Error generating metrics:', error);
      res.status(500).send('Error generating metrics');
    }
  });

  // GET /health — Health check for metrics server
  app.get('/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
  });

  return app;
}

export function startMetricsServer(
  app: express.Application,
  port: number
): void {
  app.listen(port, () => {
    console.error(`[metrics] Prometheus metrics server listening on port ${port}`);
    console.error(`[metrics] Scrape endpoint: http://localhost:${port}/metrics`);
  });
}
```

## Build Order (Dependency Chain)

### Phase 1: Foundation (No Dependencies)
1. **MetricsCollector class** — Define all metric instances (counters, histograms, gauges)
   - File: `src/metrics/collector.ts`
   - Depends on: `prom-client` package only
   - Output: Class with methods like `recordToolCall()`, `getMetrics()`

### Phase 2: Module Resolution (Depends on Registry)
2. **ModuleResolver** — Map resource_type → module name
   - File: `src/metrics/module-resolver.ts`
   - Depends on: Existing `Registry` class
   - Output: Function `createModuleResolver(registry): (args) => moduleName`
   - **Note:** Registry already exists — just extend it with `getAllToolsets()` method if needed

### Phase 3: Wrapper Logic (Depends on Collector + Resolver)
3. **ToolWrapper** — Higher-order function to wrap tool handlers
   - File: `src/metrics/wrapper.ts`
   - Depends on: MetricsCollector, ModuleResolver
   - Output: Function `wrapTool(name, handler): wrappedHandler`

### Phase 4: Integration (Depends on Wrapper)
4. **Integrate into Tool Registration** — Modify `src/tools/index.ts` to wrap all tools
   - File: `src/tools/index.ts` (existing file — modification only)
   - Depends on: ToolWrapper, MetricsCollector, ModuleResolver
   - Change: Wrap every `server.registerTool()` handler with `wrapTool()`

### Phase 5: Server Setup (Depends on Collector)
5. **MetricsServer** — Standalone Express app for `/metrics` endpoint
   - File: `src/metrics/server.ts`
   - Depends on: MetricsCollector, Config
   - Output: Express app + `startMetricsServer()` function

### Phase 6: Main Entrypoint (Depends on Server + Integration)
6. **Start Metrics Server in Main** — Modify `src/index.ts` to start metrics server
   - File: `src/index.ts` (existing file — modification only)
   - Depends on: MetricsServer
   - Change: Call `startMetricsServer()` when HTTP transport enabled

### Dependency Graph
```
prom-client
    │
    ▼
MetricsCollector ────┐
    │                │
    │                │
Registry (existing)  │
    │                │
    ▼                │
ModuleResolver ──────┤
    │                │
    ▼                │
ToolWrapper ◄────────┘
    │
    ▼
Tool Registration (src/tools/index.ts)
    │
    ▼
Main Entrypoint (src/index.ts) ◄──── MetricsServer
```

**Critical Path:** MetricsCollector → ModuleResolver → ToolWrapper → Integration

**Parallel Work:** MetricsServer can be built in parallel with ToolWrapper (both depend on MetricsCollector only)

## Configuration Requirements

### Environment Variables

| Variable | Type | Default | Purpose |
|----------|------|---------|---------|
| `HARNESS_METRICS_PORT` | number | 9090 | Port for Prometheus metrics server |
| `HARNESS_METRICS_ENABLED` | boolean | true | Enable/disable metrics collection |
| `HARNESS_METRICS_PATH` | string | /metrics | Path for metrics endpoint (rarely changed) |

### Config Schema Extension

```typescript
// src/config.ts (add to existing ConfigSchema)
export const ConfigSchema = z.object({
  // ... existing config ...

  HARNESS_METRICS_PORT: z.coerce.number().default(9090),
  HARNESS_METRICS_ENABLED: z.coerce.boolean().default(true),
  HARNESS_METRICS_PATH: z.string().default('/metrics'),
});
```

## Testing Strategy

### Unit Tests

**File:** `tests/metrics/collector.test.ts`
- Test metric registration (counter, histogram, gauge)
- Test metric increment/observe/set methods
- Test registry output format (Prometheus text format)

**File:** `tests/metrics/wrapper.test.ts`
- Test tool handler wrapping (success path)
- Test tool handler wrapping (error path)
- Test duration measurement accuracy
- Test module resolution

**File:** `tests/metrics/module-resolver.test.ts`
- Test resource_type → module mapping
- Test fallback to 'unknown' for missing resources
- Test handling of tools without resource_type

### Integration Tests

**File:** `tests/metrics/integration.test.ts`
- Test full flow: tool call → metrics incremented → scrape endpoint returns data
- Test metrics server startup on correct port
- Test `/metrics` endpoint response format
- Test `/health` endpoint

### Manual Testing

**Using Prometheus locally:**
```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'harness-mcp'
    static_configs:
      - targets: ['localhost:9090']
    scrape_interval: 15s
```

**Query examples:**
```promql
# Total tool calls by tool
sum by (tool) (mcp_tool_calls_total)

# Success rate
sum by (tool) (rate(mcp_tool_calls_total{outcome="success"}[5m]))
/
sum by (tool) (rate(mcp_tool_calls_total[5m]))

# p95 latency
histogram_quantile(0.95, sum(rate(mcp_tool_call_duration_seconds_bucket[5m])) by (le, tool))
```

## Sources

- [prom-client GitHub Repository](https://github.com/siimon/prom-client) — Official Prometheus client for Node.js with TypeScript support
- [prom-client npm Package](https://www.npmjs.com/package/prom-client) — Registry patterns and custom metrics documentation
- [Monitoring Node.js TypeScript Applications with Prometheus](https://dev.to/ziggornif/monitoring-a-nodejs-typescript-application-with-prometheus-and-grafana-43j2) — Architecture patterns for TypeScript apps
- [Prometheus Best Practices: Separate Port Configuration](https://oneuptime.com/blog/post/2026-01-06-nodejs-custom-metrics-prometheus/view) — Best practices for dedicated metrics server
- [Express Prometheus Middleware Patterns](https://www.npmjs.com/package/express-prom-bundle) — Middleware patterns for HTTP metrics
- [MCP Server Observability Overview](https://zeo.org/resources/blog/mcp-server-observability-monitoring-testing-performance-metrics) — MCP-specific monitoring patterns
- [MCP Monitoring with Prometheus & Grafana](https://medium.com/@vishaly650/monitoring-mcp-servers-with-prometheus-and-grafana-8671292e6351) — Real-world MCP metrics implementation
- [Bridging Observability Gap in MCP Servers](https://dev.to/stacklok/bridging-the-observability-gap-in-mcp-servers-with-toolhive-3827) — Proxy-based vs direct instrumentation
- [Go Middleware Patterns for Metrics](https://drstearns.github.io/tutorials/gomiddleware/) — Middleware chaining pattern (reference for TypeScript adaptation)
- [OpenTelemetry Go HTTP Instrumentation](https://uptrace.dev/guides/opentelemetry-net-http) — Wrapper pattern for metrics and tracing
- [Prometheus Histogram Buckets Design](https://oneuptime.com/blog/post/2026-01-30-prometheus-histogram-bucket-design/view) — Bucket selection for latency percentiles
- [Histogram Buckets in Prometheus](https://last9.io/blog/histogram-buckets-in-prometheus/) — Best practices for p50/p95/p99 calculation
- [Prometheus Label Best Practices](https://oneuptime.com/blog/post/2026-01-30-prometheus-label-best-practices/view) — Cardinality management and label design
- [Managing High Cardinality Metrics](https://last9.io/blog/how-to-manage-high-cardinality-metrics-in-prometheus/) — Avoiding cardinality explosion
- [Prometheus Metric Naming](https://prometheus.io/docs/practices/naming/) — Official naming conventions
- [TypeScript Decorators Documentation](https://www.typescriptlang.org/docs/handbook/decorators.html) — Decorator pattern for function wrapping (alternative to HOF)
- [Adding Otel and Prometheus to MCP](https://www.mcpevals.io/blog/adding-otel-and-prometheus-to-mcp) — Tool handler wrapper implementation for MCP

---

*Architecture research: 2026-03-19 | Confidence: HIGH*
