---
phase: 02-tool-instrumentation
plan: 02
subsystem: metrics
tags: [prometheus, prom-client, proxy-pattern, instrumentation, mcp-server, tool-registration]

requires:
  - phase: 02-tool-instrumentation
    plan: 01
    provides: withMetrics HOF and ToolHandler type from src/metrics/tool-metrics.ts

provides:
  - All 11 MCP tool handlers automatically wrapped with withMetrics at registration point
  - McpServer proxy (createInstrumentedServer) that intercepts registerTool calls
  - Automatic counter/histogram recording for every tool invocation with zero per-tool boilerplate

affects:
  - Phase 03 (session & transport metrics): tools are now fully instrumented, metrics scrape will show tool call data

tech-stack:
  added: []
  patterns:
    - "McpServer proxy pattern: Object.create(server) + override registerTool to wrap handler before forwarding"
    - "Instrumentation at registration point: no individual tool file changes needed"

key-files:
  created: []
  modified:
    - src/tools/index.ts

key-decisions:
  - "Proxy via Object.create(server) rather than modifying each of 11 tool files — satisfies zero-tool-file-change constraint"
  - "Handler is always the 3rd positional arg in registerTool(name, config, cb) — confirmed from SDK type definitions"

patterns-established:
  - "Proxy wrapping at registration: createInstrumentedServer intercepts registerTool, wraps handler, forwards to real server"

requirements-completed: [TOOL-04, TOOL-05]

duration: 2min
completed: 2026-03-19
---

# Phase 02 Plan 02: Tool Wiring Summary

**McpServer proxy that intercepts all registerTool() calls to wrap every handler with withMetrics automatically — zero per-tool boilerplate, single-file change**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-18T22:23:51Z
- **Completed:** 2026-03-19T22:26:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Created `createInstrumentedServer()` proxy using `Object.create(server)` that overrides `registerTool` to intercept handler arguments
- All 11 tools instrumented automatically: harness_list, harness_get, harness_create, harness_update, harness_delete, harness_execute, harness_diagnose, harness_search, harness_describe, harness_status, harness_ask
- Zero changes to individual tool files — only `src/tools/index.ts` modified
- All 556 existing tests continue to pass

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire withMetrics into registerAllTools via proxy interceptor** - `5d7d140` (feat)

## Files Created/Modified
- `src/tools/index.ts` - Added `createInstrumentedServer()` proxy + `withMetrics` import; passes instrumented server to all 11 registerXxxTool calls

## Decisions Made
- Used `Object.create(server)` proxy instead of modifying 11 tool files. The SDK's `registerTool(name, config, cb)` always has the handler as the 3rd argument (confirmed from type definitions), making the proxy intercept straightforward.

## Deviations from Plan

None - plan executed exactly as written. The proxy approach matched the plan's recommended solution and worked correctly without needing the fallback (direct method patching on instance).

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Tool instrumentation is complete. All 11 MCP tools now record `mcp_tool_calls_total`, `mcp_tool_call_duration_seconds`, and (for harness_execute) `mcp_tool_executions_total` on every invocation.
- Phase 03 (session & transport metrics) can proceed — the metrics scrape endpoint from Phase 01 will automatically expose these new tool call metrics.

## Self-Check: PASSED

- FOUND: src/tools/index.ts (modified with withMetrics wiring)
- FOUND: commit 5d7d140
- VERIFIED: grep confirms withMetrics in index.ts, no harness-*.ts files modified

---
*Phase: 02-tool-instrumentation*
*Completed: 2026-03-19*
