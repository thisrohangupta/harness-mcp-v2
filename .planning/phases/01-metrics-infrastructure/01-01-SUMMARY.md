---
phase: 01-metrics-infrastructure
plan: 01
subsystem: metrics
tags: [infrastructure, prometheus, prom-client, registry, config]
completed_at: "2026-03-18T21:34:08Z"
duration_seconds: 191

dependency_graph:
  requires: []
  provides:
    - metrics-registry
    - metrics-config
    - prom-client-dependency
  affects:
    - src/config.ts
    - src/metrics/registry.ts

tech_stack:
  added:
    - name: prom-client
      version: "^15.1.3"
      purpose: Prometheus metrics library for Node.js
  patterns:
    - Custom Registry isolation (not global defaultRegister)
    - Info-style gauge (mcp_build_info = 1)
    - TypeScript generic label types for compile-time safety

key_files:
  created:
    - src/metrics/registry.ts
    - tests/metrics/registry.test.ts
  modified:
    - package.json
    - pnpm-lock.yaml
    - src/config.ts

decisions:
  - decision: Use custom prom-client Registry instead of global defaultRegister
    rationale: Isolation from other libraries, control over exposed metrics, easier testing
    impact: All future metrics must use this registry explicitly via `registers: [registry]`
  - decision: Read version from package.json at module load time
    rationale: Dynamic version detection without hardcoding, fallback to "unknown" if read fails
    impact: Build info always reflects actual package version
  - decision: Set build_info gauge at module load (not lazily)
    rationale: Standard Prometheus pattern for static metadata, simplifies scraping
    impact: Metric always present on /metrics endpoint

metrics:
  tasks_completed: 2
  tasks_total: 2
  commits: 2
  files_created: 2
  files_modified: 3
  tests_added: 6
  lines_added: 89
---

# Phase 01 Plan 01: Metrics Registry Foundation Summary

**One-liner:** Installed prom-client 15.1.3 and created isolated custom Registry with mcp_build_info{version, node_version} gauge set to value 1

## What Was Built

This plan established the foundation for Prometheus metrics in the Harness MCP server by installing the prom-client library, extending the configuration schema with metrics-specific fields, and creating a custom metrics registry with a build information gauge.

### Task 1: Install prom-client and Extend Config Schema

**Completed:** ✓
**Commit:** `3f58604`

- Installed `prom-client@^15.1.3` as a production dependency
- Added `HARNESS_METRICS_PORT` config field with validation (range: 1024-65535, default: 9090)
- Added `HARNESS_METRICS_ENABLED` config field (boolean, default: true)
- Config fields follow existing codebase pattern (no `.describe()` calls, use `z.coerce.*`)
- All TypeScript compilation passed with no errors

**Files Modified:**
- `package.json` — Added prom-client dependency
- `pnpm-lock.yaml` — Updated with prom-client and dependencies
- `src/config.ts` — Extended RawConfigSchema with metrics fields

**Verification:**
```bash
✓ pnpm-client in package.json
✓ HARNESS_METRICS_PORT in config schema
✓ HARNESS_METRICS_ENABLED in config schema
✓ TypeScript compilation successful
```

### Task 2: Create Custom Metrics Registry (TDD)

**Completed:** ✓
**Commit:** `7b53d24`

Followed TDD flow: RED → GREEN (no refactor needed).

**RED Phase (failing tests):**
- Created `tests/metrics/registry.test.ts` with 6 test cases
- Tests verified registry isolation, metric name, labels, and value
- Tests failed as expected (module not found)

**GREEN Phase (implementation):**
- Created `src/metrics/registry.ts` with:
  - Custom `Registry` instance (isolated from global `register`)
  - `buildInfo` Gauge metric with `version` and `node_version` labels
  - `getServerVersion()` function to read from package.json
  - Module-load initialization setting gauge to value 1
- All 6 tests passed

**Files Created:**
- `src/metrics/registry.ts` — Custom registry and build_info gauge
- `tests/metrics/registry.test.ts` — Unit tests for registry

**Tests Added:**
1. Registry is instance of prom-client Registry (not global)
2. Metrics output contains `mcp_build_info`
3. Metrics output contains `node_version="${process.version}"`
4. Metrics output contains `version` label
5. `mcp_build_info` gauge value is 1
6. `registry.clear()` removes all metrics

**Verification:**
```bash
✓ Custom Registry instance created
✓ buildInfo gauge registered with correct labels
✓ Gauge value set to 1
✓ All 6 unit tests pass
✓ TypeScript compilation successful
```

## Deviations from Plan

None — plan executed exactly as written.

## Technical Highlights

### Custom Registry Pattern

The implementation uses a custom prom-client Registry instead of the global `defaultRegister`:

```typescript
export const registry = new Registry();
```

**Benefits:**
- Isolation from other libraries using global registry
- Full control over which metrics are exposed
- Easy to test (can call `registry.clear()` between tests)
- Matches best practices from STACK.md research

### Build Info Gauge

The `mcp_build_info` metric follows the Prometheus info-style metric convention:

```typescript
export const buildInfo = new Gauge({
  name: "mcp_build_info",
  help: "MCP server build information",
  labelNames: ["version", "node_version"] as const,
  registers: [registry],
});

buildInfo.labels({
  version: getServerVersion(),
  node_version: process.version,
}).set(1);
```

**Key Features:**
- Info-style metric (always value 1)
- Labels contain metadata (version from package.json, Node.js version)
- Set once at module load time (static information)
- TypeScript generic type ensures label name safety

### Version Detection

The `getServerVersion()` function dynamically reads the version from `package.json`:

```typescript
function getServerVersion(): string {
  try {
    const thisDir = dirname(fileURLToPath(import.meta.url));
    const pkgPath = resolve(thisDir, "..", "..", "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    return pkg.version ?? "unknown";
  } catch {
    return "unknown";
  }
}
```

**Benefits:**
- No hardcoded version strings
- Automatically reflects package.json version
- Graceful fallback to "unknown" if read fails
- Works in both development and production (build directory)

## Requirements Coverage

This plan satisfies the following requirements from REQUIREMENTS.md:

- **INFRA-02**: Config schema extended with HARNESS_METRICS_PORT and HARNESS_METRICS_ENABLED
- **INFRA-03**: Custom prom-client Registry created (not global)
- **INFRA-05**: Build info metric registered with version and node_version labels

## Next Steps

**Plan 02** will build on this foundation by:
1. Creating the metrics server (separate HTTP server on port 9090)
2. Exposing the `/metrics` endpoint
3. Serving the registry metrics in Prometheus text format

**Dependencies:**
- Plan 02 will import `registry` from `src/metrics/registry.ts`
- Metrics server will call `await registry.metrics()` to generate output

## Self-Check: PASSED

All claims verified:

**Created files exist:**
```bash
✓ FOUND: src/metrics/registry.ts
✓ FOUND: tests/metrics/registry.test.ts
```

**Commits exist:**
```bash
✓ FOUND: 3f58604 (Task 1: Install prom-client and extend config)
✓ FOUND: 7b53d24 (Task 2: Create metrics registry)
```

**Dependencies installed:**
```bash
✓ prom-client@15.1.3 in package.json
```

**Config fields present:**
```bash
✓ HARNESS_METRICS_PORT in src/config.ts
✓ HARNESS_METRICS_ENABLED in src/config.ts
```

**Tests pass:**
```bash
✓ Test Files: 38 passed (38)
✓ Tests: 528 passed (528)
✓ Duration: 2.58s
```

All deliverables confirmed. Plan 01-01 execution complete.
