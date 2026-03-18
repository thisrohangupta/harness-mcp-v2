# Phase 2: Tool Instrumentation - Context

**Gathered:** 2026-03-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Add counter and histogram metrics for every MCP tool call. Every tool invocation must record outcome (ok/tool_error/error), latency, and module attribution automatically — with no per-tool modification. The 11 registered tools (`harness_list`, `harness_get`, `harness_create`, `harness_update`, `harness_delete`, `harness_execute`, `harness_diagnose`, `harness_search`, `harness_describe`, `harness_status`, `harness_ask`) all get instrumented. Session tracking and HTTP transport metrics are Phase 3.

</domain>

<decisions>
## Implementation Decisions

### Metric schema — counter

`mcp_tool_calls_total` counter with labels `{tool, resource_type, module, outcome}`:

- `tool` — MCP tool name exactly as registered, including `harness_` prefix (e.g., `harness_list`, `harness_execute`). 11 possible values.
- `resource_type` — resource type from input (e.g., `pipeline`, `service`, `connector`). Empty string `""` when the tool doesn't target a specific resource type (harness_describe with no resource_type, harness_status, harness_ask). For harness_search and harness_diagnose: capture resource_type from input when present, empty string when absent.
- `module` — toolset name as-is from the registry (e.g., `pipelines`, `feature-flags`, `chaos`, `sto`, `ccm`). Non-resource tools (harness_describe, harness_status, harness_search, harness_ask) use `module="platform"`.
- `outcome` — one of `ok`, `tool_error`, `error` (see Outcome Classification below).

### Metric schema — histogram

`mcp_tool_call_duration_seconds` histogram with labels `{tool, resource_type, module}`:

- Same label definitions as the counter.
- Buckets: `[0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5]` seconds — covers fast in-memory ops through slow Harness API calls.

### Metric schema — execute actions counter

Separate `mcp_tool_executions_total` counter with labels `{tool, resource_type, module, outcome, action}` — for `harness_execute` calls only. Adds `action` label (e.g., `run_pipeline`, `toggle_feature_flag`) to give visibility into which execute sub-operations are being called. The main `mcp_tool_calls_total` counter does NOT have an `action` label — it tracks all 11 tools uniformly.

### Middleware approach

- Implement a `withMetrics(toolName: string, harnessRegistry: Registry)` higher-order function in `src/metrics/tool-metrics.ts`.
- `withMetrics` wraps each tool's handler function, starting the timer before the handler runs and recording counter + histogram after it returns.
- Wire in `registerAllTools()` in `src/tools/index.ts` — each `registerXxxTool(server, registry, client)` call passes the handler through `withMetrics`.
- Timer measures full tool call round-trip including MCP SDK overhead (not just Harness API time).
- The `prom-client` counter and histogram are imported directly as singletons from `src/metrics/tool-metrics.ts` — no need to thread a metrics instance through function signatures.

### Module resolution

- Done inside the `withMetrics` wrapper: extract `resource_type` from tool input, call `harnessRegistry.getResource(resource_type)?.toolset` to get the toolset name.
- If `resource_type` is absent or unknown (lookup fails), fall back to `module="platform"`.
- No new Registry method needed — use existing `getResource()` with optional chaining.

### Outcome classification

| Outcome | When |
|---------|------|
| `ok` | Handler returns without throwing AND response has `isError: false` (or no `isError` field) |
| `tool_error` | Handler returns with `isError: true` in the result content |
| `tool_error` | Handler throws and the error is user-fixable: bad `resource_type`, missing required fields, Harness API 4xx (400/403/404/422), read-only mode rejection |
| `error` | Handler throws and the error is a system failure: Harness API 5xx, network timeout, unexpected exception |

Use existing `isUserError()` / `isUserFixableApiError()` helpers from `src/utils/errors.ts` to classify thrown errors.

Empty results (list returning 0 items) = `ok` — valid successful response.

### Metrics failure handling

If the `withMetrics` wrapper itself throws while recording metrics (e.g., `counter.inc()` fails), swallow the error, log a warning to stderr, and let the tool call result propagate normally. Metrics are observability — they must never affect tool behavior.

### File structure

New file `src/metrics/tool-metrics.ts` contains:
- `mcp_tool_calls_total` counter definition
- `mcp_tool_call_duration_seconds` histogram definition
- `mcp_tool_executions_total` counter definition (execute-specific)
- `withMetrics(toolName, harnessRegistry)` HOF implementation

All three metrics register on the existing custom `registry` from `src/metrics/registry.ts`.

### Claude's Discretion

- Exact signature of `withMetrics` beyond the two required parameters
- Whether to extract `action` from harness_execute input inside `withMetrics` or in the execute tool's handler before calling withMetrics
- Internal variable naming within tool-metrics.ts
- Whether to export metric instances for testing or keep them module-private

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Metrics infrastructure (Phase 1 foundation)
- `src/metrics/registry.ts` — custom prom-client Registry instance; all new metrics must register here via `registers: [registry]`
- `src/metrics/server.ts` — existing metrics server; no changes needed in Phase 2

### Tool registration patterns
- `src/tools/index.ts` — `registerAllTools()` — this is where withMetrics wraps each tool handler
- `src/tools/harness-list.ts` — canonical example of how a tool handler is registered and returns results (including `isError: true` pattern via `errorResult()`)
- `src/tools/harness-execute.ts` — shows how action parameter flows through execute tool (needed for action label extraction)

### Registry and module resolution
- `src/registry/index.ts` — `Registry` class with `getResource(resourceType)` returning `ResourceDefinition`
- `src/registry/types.ts` — `ResourceDefinition.toolset: ToolsetName` and `ToolsetDefinition` — the data types powering module resolution

### Error classification
- `src/utils/errors.ts` — `isUserError()`, `isUserFixableApiError()`, `toMcpError()` — use these to classify thrown errors as `tool_error` vs `error`

### Requirements
- `.planning/REQUIREMENTS.md` — TOOL-01 through TOOL-06 definitions
- `.planning/ROADMAP.md` — Phase 2 success criteria (6 criteria)

### Reference implementation (Go)
- Note: Go server is in a different repo (`mcpServerInternal/pkg/middleware/metrics/tool_metrics.go`) — reference for label schema only, not accessible as a local file

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/metrics/registry.ts`: Singleton custom Registry — import and use `registry` as `registers: [registry]` for all new metrics
- `src/utils/errors.ts`: `isUserError()` and `isUserFixableApiError()` already distinguish user-fixable from system errors — use directly in outcome classification
- `src/utils/response-formatter.ts`: `errorResult()` helper returns `{isError: true, content: [...]}` — the wrapper must check for this pattern to classify `tool_error`

### Established Patterns
- Tool handlers are registered with `server.registerTool(name, schema, handler)` — the handler is a plain async function; `withMetrics` wraps this function
- All 11 tools follow the same `(args) => Promise<{content, isError?}>` handler shape — HOF works uniformly
- Error handling: tools catch internally and return `errorResult()` rather than re-throwing; uncaught errors propagate up — both cases must be handled in the wrapper

### Integration Points
- `src/tools/index.ts` `registerAllTools()` — wrap each `registerXxxTool()` call; no changes to individual tool files
- `src/metrics/registry.ts` — add exports for new metrics so they're available to `tool-metrics.ts`
- `src/registry/index.ts` `Registry.getResource()` — already public, no changes needed

</code_context>

<specifics>
## Specific Ideas

- The `withMetrics` wrapper should capture timer BEFORE calling the handler so SDK overhead is included in latency measurement
- For execute action extraction: inspect `args.action` (string) from the tool input when `toolName === "harness_execute"` — this is set by the execute tool's Zod schema

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-tool-instrumentation*
*Context gathered: 2026-03-19*
