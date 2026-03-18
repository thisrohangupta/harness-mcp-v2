---
phase: 02-tool-instrumentation
verified: 2026-03-19T04:10:00Z
status: passed
score: 11/11 must-haves verified
re_verification: false
---

# Phase 02: Tool Instrumentation Verification Report

**Phase Goal:** Operators can observe which MCP tools are used, how often they fail, and their latency distribution
**Verified:** 2026-03-19T04:10:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `mcp_tool_calls_total` counter defined with labels tool, resource_type, module, outcome | VERIFIED | `src/metrics/tool-metrics.ts` line 21–26: `labelNames: ["tool", "resource_type", "module", "outcome"]` |
| 2 | `mcp_tool_call_duration_seconds` histogram defined with labels tool, resource_type, module | VERIFIED | `src/metrics/tool-metrics.ts` line 32–38: correct labelNames and registered on custom registry |
| 3 | `mcp_tool_executions_total` counter defined with labels tool, resource_type, module, outcome, action | VERIFIED | `src/metrics/tool-metrics.ts` line 44–49: `labelNames: ["tool", "resource_type", "module", "outcome", "action"]` |
| 4 | Histogram uses buckets [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5] | VERIFIED | `src/metrics/tool-metrics.ts` line 36: `buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5]` |
| 5 | `withMetrics` HOF wraps a tool handler and records counter + histogram on every call | VERIFIED | `src/metrics/tool-metrics.ts` lines 66–110: `startTimer` in `finally` block, `toolCallsTotal.inc` always called |
| 6 | Outcome classification: ok / tool_error / error correctly assigned | VERIFIED | Lines 89 (`isError` check), 92–96 (`isUserError | isUserFixableApiError` → tool_error, else error) |
| 7 | Metrics failures are swallowed and logged as warnings — never propagate | VERIFIED | Lines 98–107: outer `finally` wraps inc/observe calls in `try/catch` with `log.warn` |
| 8 | Every tool invocation passes through withMetrics wrapper automatically | VERIFIED | `src/tools/index.ts`: `createInstrumentedServer` proxy overrides `registerTool` to wrap handler before forwarding |
| 9 | Module label derived from toolset registry — no manual per-tool mapping | VERIFIED | `src/metrics/tool-metrics.ts` lines 75–81: `harnessRegistry.getResource(resourceType).toolset` with "platform" fallback |
| 10 | No individual tool file modified — wrapping in registerAllTools only | VERIFIED | `grep` across `src/tools/harness-*.ts` returns no `withMetrics` references; only `src/tools/index.ts` changed |
| 11 | All 11 tools instrumented (harness_list, harness_get, harness_create, harness_update, harness_delete, harness_execute, harness_diagnose, harness_search, harness_describe, harness_status, harness_ask) | VERIFIED | `src/tools/index.ts` lines 45–55: all 11 `registerXxxTool` calls pass `instrumented` (proxy) server |

**Score:** 11/11 truths verified

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/metrics/tool-metrics.ts` | Tool call metrics definitions and withMetrics HOF | VERIFIED | 111 lines, exports `toolCallsTotal`, `toolCallDuration`, `toolExecutionsTotal`, `withMetrics`, `ToolHandler` |
| `tests/metrics/tool-metrics.test.ts` | Unit tests (min 80 lines) | VERIFIED | 269 lines, 19 test cases covering all outcome paths, module resolution, fallbacks, and metrics failure swallowing |
| `src/tools/index.ts` | Tool registration with metrics wrapping | VERIFIED | Imports `withMetrics`, defines `createInstrumentedServer` proxy, all 11 tools instrumented |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/metrics/tool-metrics.ts` | `src/metrics/registry.ts` | `import { registry }` | WIRED | Line 2: `import { registry } from "./registry.js"` — `registers: [registry]` on all 3 metrics |
| `src/metrics/tool-metrics.ts` | `src/utils/errors.ts` | `import { isUserError, isUserFixableApiError }` | WIRED | Line 4: import present; used at line 92 in outcome classification |
| `src/tools/index.ts` | `src/metrics/tool-metrics.ts` | `import { withMetrics }` | WIRED | Line 5: import present; used at line 34 inside `createInstrumentedServer` |
| `src/tools/index.ts` | proxy wraps all 11 handlers | `withMetrics(name, harnessRegistry)` applied in intercepted `registerTool` | WIRED | `instrumented` server passed to all 11 `registerXxxTool` calls (lines 45–55) |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|---------|
| TOOL-01 | 02-01 | `mcp_tool_calls_total` counter with `{tool, module, outcome}` labels | SATISFIED | Implemented with `resource_type` label also present — superset of requirement |
| TOOL-02 | 02-01 | Outcome label: ok / tool_error / error | SATISFIED | Three-tier classification in `withMetrics` via `isUserError`, `isUserFixableApiError`, and `isError` flag |
| TOOL-03 | 02-01 | `mcp_tool_call_duration_seconds` histogram with `{tool, module}` labels | SATISFIED | Implemented with `resource_type` label also present — superset of requirement |
| TOOL-04 | 02-02 | Module label derived from toolset registry | SATISFIED | `harnessRegistry.getResource(resourceType).toolset` with "platform" fallback |
| TOOL-05 | 02-02 | Metrics collection as middleware wrapper (no per-tool modification) | SATISFIED | `createInstrumentedServer` proxy — zero changes to individual tool files confirmed |
| TOOL-06 | 02-01 | Histogram buckets: 0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5 seconds | SATISFIED | Exact bucket array present in `tool-metrics.ts` line 36 |

All 6 requirements (TOOL-01 through TOOL-06) are satisfied. No orphaned requirements.

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | — | — | None found |

No TODOs, FIXMEs, placeholders, empty implementations, or console.log stubs detected in any phase-modified file.

---

## Test Results

- **556 tests passing** across 40 test files (full suite run)
- **19 test cases** in `tests/metrics/tool-metrics.test.ts` — all pass
- **TypeScript typecheck** exits 0 — no type errors
- Metric names present in registry output verified by test assertions on prom-client text format

---

## Human Verification Required

None. All observable behaviors for this phase are mechanically verifiable:
- Metric definitions are code-level facts
- Outcome classification logic is covered by unit tests
- Wiring is confirmed by import graph and proxy pattern
- No UI, visual, or real-time behaviors involved

---

## Summary

Phase 02 goal is achieved. All three Prometheus metrics (`mcp_tool_calls_total`, `mcp_tool_call_duration_seconds`, `mcp_tool_executions_total`) are fully defined with correct names, label sets, and bucket configuration. The `withMetrics` HOF correctly classifies call outcomes into three tiers, records duration, and swallows instrumentation failures silently. The proxy-based wiring in `src/tools/index.ts` ensures every one of the 11 registered MCP tools is automatically instrumented with zero per-tool boilerplate and zero changes to individual tool files. All 6 phase requirements (TOOL-01 through TOOL-06) are satisfied. 556 tests pass. TypeScript compilation is clean.

---

_Verified: 2026-03-19T04:10:00Z_
_Verifier: Claude (gsd-verifier)_
