# Research Summary: Prometheus Metrics for Harness MCP Server

**Domain:** Production Observability — Prometheus Metrics for Node.js/TypeScript MCP Server
**Researched:** 2026-03-19
**Overall confidence:** HIGH

## Executive Summary

Adding Prometheus metrics to the existing TypeScript MCP server follows a well-established pattern in the Node.js ecosystem. The core stack consists of **prom-client 15.1.3** (the de facto standard Prometheus client for Node.js with built-in TypeScript support) running on a **separate HTTP server port** (9090) to isolate metrics scraping from MCP protocol traffic. Optional **express-prom-bundle** middleware provides automatic RED (Request/Error/Duration) metrics for the Express-based HTTP transport.

The implementation matches the existing Go `mcpServerInternal` server's metric schema (`mcp_tool_calls_total`, `mcp_tool_call_duration_seconds`, `mcp_active_sessions`) to ensure dashboard compatibility and unified monitoring across both MCP server implementations.

Key findings:
1. **prom-client is the only viable option** — official Prometheus client library, 2359+ npm dependents, 3.4k GitHub stars, built-in TypeScript generics for type-safe labels
2. **Separate metrics port is standard practice** — isolates scraping traffic, simplifies firewall rules, follows Kubernetes sidecar pattern (port 9090 for metrics)
3. **express-prom-bundle is optional** — 21x more popular than alternatives (604k vs 28k weekly downloads), provides automatic HTTP metrics with zero config, but not needed if only MCP tool metrics are required
4. **Performance overhead is negligible** — <1ms per tool call (counter + histogram), ~10ms per scrape at 15s intervals
5. **Label cardinality is safe** — ~23k time series total (50 tools × 15 modules × 3 outcomes × 8 histogram buckets) — well below Prometheus 1M series limit

## Key Findings

**Stack:** prom-client 15.1.3 (core) + optional express-prom-bundle 7.x (HTTP middleware) + Node.js http stdlib (separate metrics server on port 9090)

**Architecture:** Dedicated metrics server on configurable port (HARNESS_METRICS_PORT=9090), custom Registry instance (not global), point-in-time metric collection via `collect()` callbacks, middleware wrapping tool calls for automatic duration/count metrics

**Critical pitfall:** Dynamic labels (user IDs, execution IDs) cause unbounded cardinality → Prometheus OOM. Use static labels (tool name, module, outcome) only. High-cardinality IDs belong in exemplars or logs, not metric labels.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Core Metrics Infrastructure (Foundation)
**Goal:** Set up prom-client registry, separate metrics server, basic configuration
**Addresses:**
- Metrics server on dedicated port (9090)
- Custom Registry instance with isolation from global registry
- Configuration via `HARNESS_METRICS_PORT`, `HARNESS_METRICS_ENABLED`
- Health check endpoint verification
- Basic test infrastructure (registry clearing between tests)

**Avoids:**
- Sharing port 3000 for MCP + metrics (violates isolation principle)
- Using global registry (prevents test isolation)
- Hardcoded port (deployment inflexibility)

**Rationale:** Foundation must be solid before adding metrics — separate concerns (MCP protocol vs observability), enable feature flag for gradual rollout, establish testing patterns

**Complexity:** Low — simple HTTP server, Zod config extension, no business logic
**Dependencies:** None — standalone infrastructure

---

### Phase 2: MCP Tool Metrics (Core Business Logic)
**Goal:** Instrument tool calls with `mcp_tool_calls_total` and `mcp_tool_call_duration_seconds`
**Addresses:**
- Counter for tool invocations (tool, module, outcome labels)
- Histogram for tool duration (tool, module labels)
- Module resolution logic (tool name → module mapping)
- Middleware wrapper for automatic instrumentation
- Error classification (success, error, validation_error)

**Avoids:**
- Manual instrumentation in every tool (error-prone, maintenance burden)
- Dynamic labels (user IDs, execution IDs in labels)
- Unbounded histogram buckets (1ms-5s range is sufficient)

**Rationale:** This is the core value — visibility into which tools are used, how often they fail, and latency patterns. Matches Go server schema for dashboard compatibility. Middleware pattern (similar to `ToolHandlerMiddleware` in Go) ensures consistent instrumentation.

**Complexity:** Medium — requires middleware integration into tool registry, module resolution logic, error classification
**Dependencies:** Phase 1 (metrics infrastructure)

---

### Phase 3: Session & Transport Metrics (HTTP-Specific)
**Goal:** Track active SSE/HTTP sessions and request/response sizes
**Addresses:**
- `mcp_active_sessions` gauge (point-in-time observation)
- `mcp_request_size_bytes` / `mcp_response_size_bytes` histograms
- Session lifecycle tracking (increment on connect, decrement on close)
- Optional express-prom-bundle for automatic HTTP RED metrics

**Avoids:**
- Interval-based session polling (use collect() callback instead)
- Body buffering for size tracking (stream measurement via Content-Length)
- HTTP metrics in stdio mode (only apply to HTTP transport)

**Rationale:** Session tracking detects connection leaks. Size metrics help capacity planning and identify payload bloat. HTTP RED metrics (if using express-prom-bundle) provide transport-layer visibility complementing MCP tool metrics.

**Complexity:** Medium — session lifecycle tracking, conditional express-prom-bundle integration, transport mode detection
**Dependencies:** Phase 1 (infrastructure), Phase 2 (tool metrics — demonstrates pattern)

---

### Phase 4: Node.js Runtime Metrics (Optional, Production Hardening)
**Goal:** Enable default Node.js process metrics (event loop lag, GC, memory)
**Addresses:**
- `collectDefaultMetrics()` with custom registry
- Event loop lag monitoring (detect blocking operations)
- GC duration tracking (detect GC pauses causing latency spikes)
- Memory metrics (RSS, heap size — detect leaks)
- Configuration flag: `HARNESS_METRICS_DEFAULT_METRICS`

**Avoids:**
- Always-on default metrics (allow disabling for stdio-only mode)
- Default histogram buckets for GC (use custom: 1ms, 10ms, 100ms, 1s, 5s)

**Rationale:** Operational visibility into Node.js runtime health. Event loop lag >100ms indicates blocking operations (blocking I/O, CPU-bound loops). GC pauses >1s cause request timeouts. These are opt-in diagnostics, not core functionality.

**Complexity:** Low — one-line enablement, configuration flag
**Dependencies:** Phase 1 (infrastructure)

---

### Phase 5: Documentation & Deployment (Operationalization)
**Goal:** Document metrics, provide Prometheus scrape config examples, deployment guides
**Addresses:**
- Metrics reference (name, type, labels, purpose)
- Histogram bucket rationale (why 1ms-5s for tool latency)
- Prometheus scrape config examples
- Kubernetes deployment with separate metrics service
- Docker healthcheck for /metrics endpoint
- Migration guide (matching Go server schema)

**Avoids:**
- Shipping Grafana dashboards (operators bring their own)
- Push-based metrics (Pushgateway — pull model only)

**Rationale:** Operators need to understand what metrics mean, how to query them, and how to deploy. Migration guide ensures Go + TypeScript servers use identical metric schema for unified dashboards.

**Complexity:** Low — documentation only, no code
**Dependencies:** Phase 2-4 (all metrics implemented)

---

## Phase Ordering Rationale

1. **Infrastructure first (Phase 1)** — separate server, config, testing patterns established before adding metrics
2. **Core value second (Phase 2)** — tool metrics are primary requirement, prove the pattern works
3. **HTTP-specific third (Phase 3)** — builds on tool metrics pattern, only applies to HTTP transport
4. **Runtime metrics fourth (Phase 4)** — optional diagnostics, independent of core functionality
5. **Docs last (Phase 5)** — can only document after implementation complete

**Parallel opportunities:**
- Phase 3 + Phase 4 can run in parallel (independent — sessions vs runtime metrics)
- Phase 5 can start during Phase 4 (document as you build)

**Critical path:** Phase 1 → Phase 2 → Phase 3 → Phase 5 (sessions are more critical than runtime metrics)

## Research Flags for Phases

| Phase | Research Needed? | Reason |
|-------|------------------|--------|
| Phase 1 | ❌ No | Standard HTTP server pattern, well-documented in prom-client README |
| Phase 2 | ⚠️ Maybe | Module resolution logic depends on existing tool registry structure — verify `src/tools/registry.ts` pattern before implementing |
| Phase 3 | ❌ No | Session tracking is straightforward (increment/decrement pattern), express-prom-bundle is well-documented |
| Phase 4 | ❌ No | `collectDefaultMetrics()` is one function call, fully documented |
| Phase 5 | ❌ No | Documentation phase — no technical unknowns |

**Deep dive needed:** Phase 2 module resolution — current tool registry in `src/tools/` may already have module grouping logic. Verify before implementing separate `TOOL_TO_MODULE` mapping.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack (prom-client) | HIGH | Official Prometheus client, verified via npm registry, GitHub repo, Prometheus docs, 2+ years of version stability (15.1.3) |
| Architecture (separate port) | HIGH | Standard Kubernetes sidecar pattern, verified via Prometheus best practices, multiple production case studies |
| Performance (<1ms overhead) | MEDIUM | Based on prom-client benchmarks and Node.js production blogs, not profiled in this specific codebase |
| Histogram buckets | HIGH | Verified via Prometheus histogram docs, multiple 2025-2026 blog posts with production examples |
| express-prom-bundle | HIGH | 21x more downloads than alternatives, verified via npm trends, community recommendations |
| TypeScript types | HIGH | Verified via prom-client index.d.ts source, changelog for v15 generic label changes |
| Label cardinality | HIGH | Calculated from known constants (50 tools, 15 modules, 3 outcomes), verified against Prometheus cardinality docs |

## Gaps to Address

### 1. Module Resolution Implementation (Phase 2)
**Gap:** Research shows module resolution is needed (tool name → module mapping), but implementation depends on existing `src/tools/registry.ts` structure
**Action:** Before Phase 2 implementation, inspect `src/tools/` to determine:
- Does registry already group tools by module?
- Is module name available in tool metadata?
- Or is manual `TOOL_TO_MODULE` mapping needed?

**Resolution:** Phase-specific research during Phase 2 planning — 15-minute code inspection, not full research cycle

### 2. Histogram Bucket Tuning (Phase 2-3)
**Gap:** Research provides default buckets (1ms-5s for tool latency), but optimal buckets depend on production latency distribution
**Action:**
1. Ship with researched defaults
2. After 1 week in production, query p50/p95/p99 from Prometheus
3. Adjust buckets if percentiles fall between bucket boundaries

**Resolution:** Iterative tuning post-launch, not pre-launch research

### 3. express-prom-bundle vs Manual HTTP Metrics (Phase 3)
**Gap:** Research shows express-prom-bundle is popular, but decision depends on whether automatic route normalization is needed
**Action:** During Phase 3 planning, decide:
- Use express-prom-bundle if you want automatic HTTP RED metrics with zero config
- Use manual prom-client histograms if you need custom bucket configuration or label dimensions

**Resolution:** Implementation decision, not research gap — both approaches are valid

### 4. Default Metrics Enable/Disable Logic (Phase 4)
**Gap:** Research confirms `collectDefaultMetrics()` exists, but decision on when to disable (stdio mode?) needs product input
**Action:** During Phase 4 planning, answer:
- Should default metrics be disabled in stdio mode? (no HTTP transport → no scraping)
- Should default metrics be always-on? (useful for debugging stdio mode via log export)

**Resolution:** Product decision based on deployment patterns — not a technical research gap

---

## Summary of Deliverables

This research produced:
1. **STACK.md** — Technology recommendations (prom-client 15.1.3, express-prom-bundle 7.x, separate HTTP server)
2. **SUMMARY.md** (this file) — Roadmap implications, phase structure, research flags

Files NOT produced (not applicable for this narrow stack research):
- **FEATURES.md** — N/A (metrics are infrastructure, not user-facing features)
- **ARCHITECTURE.md** — Included in STACK.md (architecture patterns section covers metrics server, registry, middleware)
- **PITFALLS.md** — Covered in STACK.md (anti-patterns section: dynamic labels, shared port, global registry)
- **COMPARISON.md** — Covered in STACK.md (alternatives considered section)

---

*Research completed: 2026-03-19*
*Ready for roadmap creation: Yes — all stack decisions made, phase structure defined, research flags identified*
