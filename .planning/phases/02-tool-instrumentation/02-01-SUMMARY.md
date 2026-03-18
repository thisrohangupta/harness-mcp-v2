---
phase: 02-tool-instrumentation
plan: 01
subsystem: metrics
tags: [prom-client, prometheus, metrics, counter, histogram, HOF, instrumentation]

requires:
  - phase: 01-metrics-infrastructure
    provides: custom prom-client Registry instance (registry) and metrics server

provides:
  - toolCallsTotal Counter (mcp_tool_calls_total) with tool/resource_type/module/outcome labels
  - toolCallDuration Histogram (mcp_tool_call_duration_seconds) with 8 buckets
  - toolExecutionsTotal Counter (mcp_tool_executions_total) with action label
  - withMetrics HOF for wrapping tool handlers with automatic metric recording
  - ToolHandler type export for use in wiring phase

affects:
  - 02-02 (tool wiring: uses withMetrics HOF and ToolHandler type)

tech-stack:
  added: []
  patterns:
    - "withMetrics HOF pattern: wrap handler → classify outcome → record in finally block"
    - "Metrics failures swallowed in try/catch inside finally to never break tool callers"
    - "Module resolution via harnessRegistry.getResource(resource_type).toolset with 'platform' fallback"
    - "execute-specific counter gated on toolName === 'harness_execute' check"

key-files:
  created:
    - src/metrics/tool-metrics.ts
    - tests/metrics/tool-metrics.test.ts
  modified: []

key-decisions:
  - "Outcome 'tool_error' covers both isError:true results AND user-fixable thrown errors (isUserError | isUserFixableApiError)"
  - "Outcome 'error' reserved for system/infrastructure failures only (non-user-fixable exceptions)"
  - "toolExecutionsTotal only incremented for harness_execute — prevents polluting counter for non-execute tools"
  - "Module falls back to 'platform' when resource_type absent or registry.getResource throws"
  - "histogram buckets [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5] chosen for sub-millisecond to 5s range"

patterns-established:
  - "TDD flow: write 18 failing tests first, then implement to green"
  - "beforeEach resets metric values via .reset() (not registry.resetMetrics) to avoid deregistration of singletons"
  - "Histogram bucket tests require an actual observation before prom-client emits le= labels in text output"

requirements-completed: [TOOL-01, TOOL-02, TOOL-03, TOOL-06]

duration: 2min
completed: 2026-03-19
---

# Phase 02 Plan 01: Tool Metrics HOF Summary

**Three Prometheus metrics (counter, histogram, execute counter) with withMetrics HOF that classifies outcomes and records tool call telemetry automatically on every invocation**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-19T22:18:19Z
- **Completed:** 2026-03-19T22:20:31Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments
- Defined `toolCallsTotal` Counter with tool/resource_type/module/outcome labels registered on custom registry
- Defined `toolCallDuration` Histogram with 8 buckets covering sub-ms to 5s range
- Defined `toolExecutionsTotal` Counter with additional action label for execute tracking
- Implemented `withMetrics` HOF with three-tier outcome classification (ok/tool_error/error)
- 18 unit tests covering all outcome paths, module resolution, fallbacks, and metrics failure swallowing

## Task Commits

1. **Task 1: Create tool-metrics.ts with metric definitions and withMetrics HOF** - `2b053e4` (feat)

## Files Created/Modified
- `src/metrics/tool-metrics.ts` - Three metric definitions + withMetrics HOF + ToolHandler type export
- `tests/metrics/tool-metrics.test.ts` - 18 unit tests covering all outcome paths and edge cases

## Decisions Made
- Used `.reset()` (not `registry.resetMetrics()`) in test `beforeEach` to clear metric values without deregistering module-level singletons
- Bucket test requires an actual observation call before prom-client emits `le=` label lines — adjusted test to trigger a wrapped handler call first

## Deviations from Plan

None — plan executed exactly as written. The only adjustment was the test implementation detail: prom-client only emits histogram bucket lines after at least one observation, so the bucket test was written to call a wrapped handler to populate the output (this is consistent with the plan's intent of verifying the correct buckets are configured).

## Issues Encountered
- prom-client does not emit histogram bucket label lines (`le="0.001"` etc.) until at least one observation is recorded — the bucket test needed a handler call before asserting on metric output. Resolved by triggering a wrapped handler call in that test case.

## Next Phase Readiness
- `withMetrics` HOF and `ToolHandler` type are ready for wiring into `src/tools/harness-list.ts`, `src/tools/harness-execute.ts`, etc.
- All three metrics registered on the custom registry and will appear in `/metrics` scrape output immediately after Phase 02-02 wires them in

## Self-Check: PASSED

- FOUND: src/metrics/tool-metrics.ts
- FOUND: tests/metrics/tool-metrics.test.ts
- FOUND: commit 2b053e4 (feat(02-01): implement tool metrics HOF)

---
*Phase: 02-tool-instrumentation*
*Completed: 2026-03-19*
