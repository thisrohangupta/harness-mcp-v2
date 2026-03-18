# Domain Pitfalls: Prometheus Metrics in Node.js MCP Servers

**Domain:** Prometheus metrics instrumentation for TypeScript MCP server (HTTP transport)
**Researched:** 2026-03-19

## Critical Pitfalls

Mistakes that cause production outages, data corruption, or require rewrites.

### Pitfall 1: Stdout Contamination Breaking JSON-RPC Protocol
**What goes wrong:** Writing ANY output to stdout (console.log, prom-client debug output, metric serialization errors) corrupts the JSON-RPC message stream in stdio transport. The MCP STDIO protocol requires that ONLY valid JSON-RPC messages appear on stdout. Even a single stray log line breaks protocol communication completely.

**Why it happens:**
- Developers habitually use `console.log()` for debugging
- Some libraries (including older prom-client versions) emit warnings/errors to stdout
- Metric collection errors might surface as stdout messages
- Default Node.js error handlers write stack traces to stdout

**Consequences:**
- MCP clients receive corrupted responses and disconnect
- Protocol parser fails with "unexpected token" errors
- Silent failures where metrics work but MCP communication breaks
- Debugging becomes impossible because adding logs breaks the system further

**Prevention:**
1. **Separate metrics server on dedicated port** — isolate metrics HTTP endpoint from MCP stdio transport completely (different process or dedicated HTTP server)
2. **All logging to stderr ONLY** — use `console.error()` or structured logger (Pino, Winston) configured for stderr output
3. **Override console.log globally** in production: `console.log = console.error`
4. **Test with MCP Inspector** — verify stdio transport works correctly with metrics enabled
5. **CI validation** — automated test that runs server in stdio mode, sends JSON-RPC request, validates no stdout pollution

**Detection:**
- MCP client shows connection errors: "Invalid JSON-RPC response"
- `@modelcontextprotocol/inspector` reports protocol violations
- Server logs show successful metric collection, but client can't communicate
- stdout contains anything other than JSON-RPC messages

**Phase mapping:** Phase 1 (Foundation) must establish separate metrics port architecture to prevent this.

---

### Pitfall 2: Label Cardinality Explosion
**What goes wrong:** Using high-cardinality labels (user IDs, IP addresses, session IDs, request IDs, timestamps) creates millions of unique time series. Each unique combination of metric name + label values creates a separate time series in Prometheus. With unbounded labels, memory usage explodes, scrape times grow to 10+ seconds, queries timeout, and Prometheus OOMs.

**Why it happens:**
- Natural instinct to track per-user or per-session metrics for debugging
- Including raw endpoint paths with UUIDs/IDs: `/api/pipeline/abc-123-xyz` instead of `/api/pipeline/:id`
- Adding HTTP status codes as labels without normalization (200, 201, 404 instead of 2xx, 4xx)
- Tool names that include dynamic parameters or versions

**Consequences:**
- Prometheus server runs out of memory (typical: 8GB consumed by 50K series)
- Metrics scrape endpoint timeout (30s default, but scrape takes 45s+)
- Query latency becomes unbearable (5+ minutes for simple queries)
- Storage costs explode ($$$)
- Entire monitoring stack becomes unusable

**Prevention:**
1. **Bounded label value sets ONLY**:
   - Tool names: ~50-100 registered tools (SAFE)
   - Module names: ~15 Harness modules (SAFE)
   - Outcome: success, error, timeout (3 values, SAFE)
   - HTTP status: 2xx, 3xx, 4xx, 5xx (5 values, SAFE)
   - Method: GET, POST, PUT, DELETE, PATCH (5 values, SAFE)

2. **Normalize dynamic paths**:
   ```typescript
   // WRONG: unbounded cardinality
   const path = req.path; // /api/pipeline/abc-123, /api/pipeline/def-456

   // RIGHT: bounded cardinality
   const path = req.route?.path || 'unknown'; // /api/pipeline/:id
   ```

3. **Validation guard at registration**:
   ```typescript
   const ALLOWED_TOOLS = new Set(['list_pipelines', 'execute_pipeline', ...]); // from registry

   toolCallCounter.inc({
     tool: ALLOWED_TOOLS.has(toolName) ? toolName : 'unknown',
     outcome: ['success', 'error', 'timeout'].includes(outcome) ? outcome : 'error'
   });
   ```

4. **Cardinality estimation formula**:
   ```
   Max series = (tool count) × (module count) × (outcome count)
   = 100 × 15 × 3 = 4,500 series (SAFE, under 10K threshold)
   ```

5. **Monitor cardinality in production**: Track actual series count via `/metrics` size or Prometheus admin API

**Detection:**
- Prometheus shows warnings: "many time series with metric name X"
- `/metrics` endpoint response exceeds 1MB
- Scrape duration metric `scrape_duration_seconds` > 5 seconds
- Memory usage grows unbounded over days
- Prometheus UI shows series count > 100K

**Phase mapping:** Phase 1 (Foundation) must validate all label sets before any metric registration.

---

### Pitfall 3: Registry Singleton Conflicts Across Dependencies
**What goes wrong:** Multiple prom-client instances (from different npm packages or bundled dependencies) each create their own global registry. When you try to collect metrics, you only get metrics from ONE registry (usually the last loaded). Or worse, attempting to register the same metric name in multiple registries throws "metric already registered" errors, crashing the app at startup.

**Why it happens:**
- npm/pnpm resolves multiple versions of prom-client in node_modules
- Dependency tree includes packages that bundle their own prom-client (e.g., express-prom-bundle v6 vs v7)
- Transitive dependencies don't share the same prom-client instance
- Some packages use `require('prom-client')` while others use `import * as promClient from 'prom-client'`

**Consequences:**
- Metrics from dependencies silently disappear (you only see YOUR metrics, not theirs)
- Startup crashes with "A metric with the name X has already been registered"
- Duplicate metric names with conflicting types (Counter vs Histogram)
- Memory leaks from abandoned registries never being garbage collected

**Prevention:**
1. **Single prom-client version in lockfile**: Use npm/pnpm overrides to force single version
   ```json
   // package.json
   {
     "pnpm": {
       "overrides": {
         "prom-client": "15.1.3"
       }
     }
   }
   ```

2. **Explicit registry passing**: Never rely on global registry
   ```typescript
   import { Registry, Counter } from 'prom-client';

   // Create ONE registry instance at app startup
   export const registry = new Registry();

   // Pass registry explicitly to ALL metrics
   const counter = new Counter({
     name: 'my_counter',
     help: 'Counter help',
     registers: [registry] // EXPLICIT, not default global
   });
   ```

3. **Centralized metrics module**: Export single registry + factory functions
   ```typescript
   // src/metrics/index.ts
   export const registry = new Registry();

   export function createCounter(name: string, help: string, labelNames?: string[]) {
     return new Counter({ name, help, labelNames, registers: [registry] });
   }
   ```

4. **Verify at startup**: Check registry contents match expectations
   ```typescript
   const metrics = await registry.getMetricsAsJSON();
   console.error(`[metrics] Registered ${metrics.length} metrics`);
   ```

**Detection:**
- `npm ls prom-client` shows multiple versions installed
- `/metrics` endpoint missing expected metrics from dependencies
- Error logs: "A metric with the name X has already been registered"
- Startup fails with registry conflict errors

**Phase mapping:** Phase 1 (Foundation) must establish single registry pattern and validate in package.json.

---

### Pitfall 4: Cluster Mode Aggregation Choking Master Process
**What goes wrong:** In Node.js cluster mode (multiple workers), prom-client aggregates metrics from all workers in the master process. With large metric payloads (400KB–1MB per worker) and frequent scrapes (every 15s), the IPC (inter-process communication) message passing + JSON serialization/deserialization becomes CPU-bound, blocking the event loop in the master process for 100ms–1s. This blocks ALL workers simultaneously, causing request timeouts and P99 latency spikes.

**Why it happens:**
- Default histogram buckets (10–13 buckets) × many metrics = huge payload
- Scrape interval (15s) × worker count (8) = 8 IPC roundtrips per scrape
- Master process is single-threaded — aggregation is O(n) CPU-bound operation
- Metrics payload is JSON (slow to serialize/deserialize at MB scale)

**Consequences:**
- P99 latency jumps from 50ms to 400–600ms when metrics enabled
- Event loop lag spikes to 500ms–1s every 15 seconds (scrape interval)
- Request timeouts during metric aggregation window
- Production outage if scrape interval < aggregation time (death spiral)

**Prevention:**
1. **THIS PROJECT: HTTP-only, no cluster mode** — explicitly document that metrics are for HTTP transport only, stdio is single-process
   ```typescript
   // src/config.ts validation
   if (process.env.NODE_ENV === 'production' && cluster.isWorker) {
     throw new Error('Metrics not supported in cluster mode — use HTTP transport with single process');
   }
   ```

2. **Reduce bucket count for histograms**: Default is 13 buckets, reduce to 5–7
   ```typescript
   const histogram = new Histogram({
     name: 'mcp_tool_call_duration_seconds',
     help: 'Tool call duration',
     buckets: [0.001, 0.01, 0.1, 0.5, 1, 2.5, 5], // 7 buckets instead of default 13
   });
   ```

3. **If cluster mode required (future)**: Use external metrics aggregator (Prometheus Pushgateway or StatsD)

4. **Monitor aggregation cost**: Track master process CPU and event loop lag during scrapes

**Detection:**
- P99 latency spikes correlate exactly with scrape interval (every 15s, 30s, etc.)
- Event loop lag metric shows 500ms+ spikes
- Master process CPU usage spikes to 100% during scrapes
- Prometheus scrape duration > 5 seconds

**Phase mapping:** Phase 1 (Foundation) must document no-cluster-mode constraint. Future enhancement (out of scope).

---

### Pitfall 5: Event Loop Blocking from collectDefaultMetrics
**What goes wrong:** Calling `collectDefaultMetrics()` enables GC stats, event loop monitoring, and Node.js version tracking. Event loop monitoring uses `perf_hooks.monitorEventLoopDelay()` which samples event loop delay every 10ms by default. With high request throughput (1000+ req/s), the sampling overhead becomes measurable (5–10ms added latency). Worse, the mean/max/percentile stats from libuv NEVER reset, so after days of uptime, the metrics become stale and meaningless (always showing peak values from initialization).

**Why it happens:**
- `collectDefaultMetrics()` is recommended in all tutorials/docs as "best practice"
- Default sampling resolution (10ms) is too aggressive for high-throughput services
- libuv's `monitorEventLoopDelay` accumulates stats indefinitely without reset
- Developers don't read the fine print about resolution offset and stat staleness

**Consequences:**
- 5–10ms added latency per request in high-throughput scenarios
- Event loop lag metrics become meaningless after 48h+ uptime (always show max from days ago)
- Misleading dashboards — operators see "event loop lag: 500ms" but it happened 3 days ago
- Performance regression introduced by "observability improvement"

**Prevention:**
1. **Selective default metrics**: Don't blindly enable all defaults
   ```typescript
   import { collectDefaultMetrics, register } from 'prom-client';

   // WRONG: enables everything, including problematic event loop monitoring
   collectDefaultMetrics();

   // RIGHT: selective enablement
   collectDefaultMetrics({
     gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2], // GC is useful
     eventLoopMonitoringPrecision: 100, // Reduce sampling from 10ms to 100ms (10x less overhead)
   });
   ```

2. **For THIS project (HTTP-only MCP server)**: Skip event loop monitoring entirely — low request volume
   ```typescript
   // src/metrics/index.ts
   collectDefaultMetrics({
     prefix: 'mcp_',
     gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5],
     // Omit eventLoopMonitoringPrecision — disables event loop monitoring
   });
   ```

3. **If event loop monitoring required**: Implement custom reset logic
   ```typescript
   import { monitorEventLoopDelay } from 'perf_hooks';

   const histogram = monitorEventLoopDelay({ resolution: 100 });
   histogram.enable();

   // Reset stats every hour to prevent staleness
   setInterval(() => {
     histogram.reset();
   }, 60 * 60 * 1000);
   ```

4. **Benchmark before enabling**: Measure P50/P95/P99 with and without default metrics

**Detection:**
- P50/P95 latency increases by 5–10ms after enabling metrics
- Event loop lag metric shows same max value for days
- CPU usage increases by 5–10% after enabling collectDefaultMetrics
- Prometheus scrape includes `nodejs_eventloop_lag_*` metrics with stale values

**Phase mapping:** Phase 2 (Metrics Implementation) must selectively enable defaults, skip event loop monitoring.

---

## Moderate Pitfalls

Issues that cause operational pain but don't break production.

### Pitfall 6: Insecure Metrics Endpoint Exposure
**What goes wrong:** Exposing `/metrics` endpoint without authentication on a public-facing server leaks sensitive operational data: request volumes, error rates, user counts, API keys in labels (if misconfigured), infrastructure topology. Attackers use this intel for reconnaissance before attacks.

**Prevention:**
1. **Separate metrics port bound to localhost**: `127.0.0.1:9090` not `0.0.0.0:9090`
   ```typescript
   // src/index.ts
   const metricsServer = http.createServer((req, res) => {
     if (req.url === '/metrics') {
       res.setHeader('Content-Type', register.contentType);
       res.end(await register.metrics());
     }
   });
   metricsServer.listen(config.HARNESS_METRICS_PORT, '127.0.0.1'); // localhost only
   ```

2. **Document in README**: Metrics port is internal-only, use firewall rules or SSH tunnel for remote scraping

3. **For production deployments**: Add basic auth or mTLS if metrics must be public
   ```typescript
   if (req.headers.authorization !== `Bearer ${config.METRICS_AUTH_TOKEN}`) {
     res.writeHead(401);
     res.end('Unauthorized');
     return;
   }
   ```

**Detection:**
- Port scan shows metrics port open to 0.0.0.0
- `/metrics` endpoint returns 200 OK without authentication
- Security audit flags unauthenticated internal endpoints

---

### Pitfall 7: Histogram Bucket Configuration Mismatch
**What goes wrong:** Using default histogram buckets (designed for HTTP latencies: 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10) for tool call durations that have different characteristic ranges. If tool calls are typically 100ms–5s, most samples land in the top bucket (>10s) or overflow (+Inf), making percentile calculations meaningless.

**Prevention:**
1. **Domain-specific bucket ranges**: Match expected tool call latencies
   ```typescript
   // Tool calls: typically 100ms to 10s (slower than HTTP requests)
   const toolDurationHistogram = new Histogram({
     name: 'mcp_tool_call_duration_seconds',
     buckets: [0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30], // Shifted right from HTTP defaults
   });
   ```

2. **Use exponentialBuckets helper**:
   ```typescript
   import { exponentialBuckets } from 'prom-client';

   const buckets = exponentialBuckets(0.1, 2, 8); // Start 0.1s, factor 2, 8 buckets
   // Generates: [0.1, 0.2, 0.4, 0.8, 1.6, 3.2, 6.4, 12.8]
   ```

3. **Validate after 1 week production data**: Check bucket distribution
   ```promql
   # Query in Prometheus
   histogram_quantile(0.95, mcp_tool_call_duration_seconds_bucket)

   # Check bucket utilization
   mcp_tool_call_duration_seconds_bucket
   ```

**Detection:**
- Most samples land in `+Inf` bucket (overflow)
- Percentile queries return NaN or implausible values
- Bucket distribution shows 90%+ of samples in single bucket

---

### Pitfall 8: Metrics Scrape Timeout Cascade
**What goes wrong:** Prometheus scrape timeout (default 10s) is shorter than actual scrape duration (12s with large registry). Prometheus marks scrape as failed, increments failure counter, retries more frequently, increasing load on server, making scrape even slower, death spiral.

**Prevention:**
1. **Monitor scrape duration**: Add metric for registry serialization time
   ```typescript
   const scrapeStart = Date.now();
   const metrics = await register.metrics();
   const scrapeDuration = Date.now() - scrapeStart;
   scrapeDurationGauge.set(scrapeDuration / 1000);
   ```

2. **Set realistic scrape timeout in Prometheus config**:
   ```yaml
   scrape_configs:
     - job_name: 'harness-mcp'
       scrape_interval: 30s
       scrape_timeout: 20s  # Must be < scrape_interval
   ```

3. **Reduce metric count if scrape > 5s**: Remove low-value metrics

**Detection:**
- Prometheus UI shows scrape errors: "context deadline exceeded"
- Scrape duration metric consistently > 10s
- Metrics missing data points at regular intervals (failed scrapes)

---

### Pitfall 9: Memory Leak from Unbounded Histogram Label Combinations
**What goes wrong:** Even with bounded label sets, the COMBINATION of labels can explode if not validated. Example: 50 tools × 15 modules × 3 outcomes = 2,250 series (OK). But if tool-to-module mapping isn't enforced, you might get tool="list_pipelines" × module="chaos" (invalid) creating phantom series. Over time, these accumulate and leak memory.

**Prevention:**
1. **Validate label combinations at instrumentation time**:
   ```typescript
   // src/metrics/tool-metrics.ts
   import { TOOLSET_TO_MODULE } from '../registry';

   export function recordToolCall(toolName: string, outcome: string, duration: number) {
     const module = TOOLSET_TO_MODULE.getModuleForTool(toolName);

     if (!module) {
       console.error(`[metrics] Unknown tool: ${toolName}, skipping metric`);
       return; // Don't create phantom series
     }

     toolCallCounter.inc({ tool: toolName, module, outcome });
     toolDurationHistogram.observe({ tool: toolName, module }, duration);
   }
   ```

2. **Unit test label combinations**: Assert series count stays bounded
   ```typescript
   // test/metrics.test.ts
   it('should not create phantom series for invalid tool-module combos', async () => {
     recordToolCall('unknown_tool', 'success', 1.0);

     const metrics = await registry.getMetricsAsJSON();
     const toolCallMetric = metrics.find(m => m.name === 'mcp_tool_calls_total');

     expect(toolCallMetric.values.length).toBeLessThan(5000); // Max expected series
   });
   ```

**Detection:**
- Series count grows linearly over time (should be constant after warmup)
- Memory usage increases even with constant traffic
- `/metrics` shows unexpected label combinations

---

## Minor Pitfalls

Issues that cause confusion or require workarounds, but don't block progress.

### Pitfall 10: Default Metrics Prefix Conflicts
**What goes wrong:** Calling `collectDefaultMetrics({ prefix: 'mcp_' })` prefixes all Node.js default metrics with `mcp_`, but some Prometheus queries and dashboards expect standard names like `nodejs_heap_size_total_bytes`. This breaks existing dashboards and queries.

**Prevention:**
1. **Use prefix only for custom metrics**: Keep default metrics unprefixed
   ```typescript
   // Default metrics — no prefix (standard names)
   collectDefaultMetrics();

   // Custom metrics — use prefix
   const toolCallCounter = new Counter({
     name: 'mcp_tool_calls_total', // Explicit prefix
     help: 'Total tool calls',
   });
   ```

2. **Document metric naming convention**: `mcp_*` for custom, `nodejs_*` for defaults

**Detection:**
- Grafana dashboards show "no data" for standard Node.js panels
- Prometheus queries fail: `nodejs_heap_size_total_bytes` not found

---

### Pitfall 11: Forgetting to Call .startTimer() / .labels() Before Recording
**What goes wrong:** Histogram/Summary timer pattern requires explicit `.startTimer()` call. If you forget and just call `.observe()`, you get incorrect duration (measures from process start, not operation start).

**Prevention:**
1. **Use timer pattern consistently**:
   ```typescript
   // WRONG: measures from process start
   const start = Date.now();
   await doWork();
   histogram.observe(Date.now() - start);

   // RIGHT: use prom-client timer
   const end = histogram.startTimer();
   await doWork();
   end(); // Automatically records duration
   ```

2. **With labels**:
   ```typescript
   const end = histogram.startTimer({ tool: 'list_pipelines', module: 'pipelines' });
   await doWork();
   end();
   ```

**Detection:**
- Duration metrics show huge values (millions of seconds = process uptime)
- P50 duration > operation timeout (impossible)

---

### Pitfall 12: Not Handling Metric Collection Errors
**What goes wrong:** `register.metrics()` can throw if metric serialization fails (rare, but possible with corrupted registry state). If uncaught, this crashes the metrics server, taking down the entire app.

**Prevention:**
1. **Wrap metrics endpoint in try/catch**:
   ```typescript
   app.get('/metrics', async (req, res) => {
     try {
       res.set('Content-Type', register.contentType);
       const metrics = await register.metrics();
       res.end(metrics);
     } catch (err) {
       console.error('[metrics] Failed to serialize metrics:', err);
       res.status(500).end('Internal Server Error');
     }
   });
   ```

**Detection:**
- Metrics endpoint returns 500 intermittently
- Server crashes with "Unhandled promise rejection" in metrics code

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| **Phase 1: Foundation** | Stdout contamination (Pitfall 1) | Separate metrics port architecture, stderr-only logging |
| **Phase 1: Foundation** | Registry singleton conflicts (Pitfall 3) | Single prom-client version, explicit registry passing |
| **Phase 1: Foundation** | Label cardinality explosion (Pitfall 2) | Validate label sets at registration, bounded enums only |
| **Phase 2: Metrics Implementation** | Event loop blocking from collectDefaultMetrics (Pitfall 5) | Skip event loop monitoring, selective default metrics |
| **Phase 2: Metrics Implementation** | Histogram bucket mismatch (Pitfall 7) | Domain-specific buckets for tool call latencies (100ms–30s range) |
| **Phase 3: Integration Testing** | Cluster mode aggregation choking (Pitfall 4) | Document HTTP-only, no cluster mode constraint |
| **Phase 3: Integration Testing** | Metrics scrape timeout cascade (Pitfall 8) | Monitor scrape duration, set Prometheus timeout > actual duration |
| **Phase 4: Documentation** | Insecure metrics endpoint exposure (Pitfall 6) | Document localhost binding, firewall requirements |
| **Phase 4: Documentation** | Lack of metric naming standards | Document `mcp_*` prefix for custom, `nodejs_*` for defaults |

---

## Sources

### Label Cardinality & High Cardinality Issues
- [Common Prometheus Pitfalls in Node.js Applications](https://bacebu4.com/posts/common-prometheus-pitfalls-in-nodejs-applications-and-how-to-avoid-them/)
- [How to Manage High Cardinality Metrics in Prometheus | Last9](https://last9.io/blog/how-to-manage-high-cardinality-metrics-in-prometheus/)
- [How to Manage Metric Cardinality in Prometheus | OneUptime](https://oneuptime.com/blog/post/2026-01-25-prometheus-metric-cardinality/view)
- [Prometheus Label cardinality explosion - Stack Diagnosis](https://drdroid.io/stack-diagnosis/prometheus-label-cardinality-explosion)
- [What are the Limitations of Prometheus Labels? | SigNoz](https://signoz.io/guides/what-are-the-limitations-of-prometheus-labels/)

### Performance & Memory Issues
- [Optimizing prom-client: How We Improved P99 Latencies by 10x in Node.js | Medium](https://medium.com/@Games24x7Tech/optimizing-prom-client-how-we-improved-p99-latencies-by-10x-in-node-js-c3c2f6c68297)
- [Memory leak · Issue #142 · siimon/prom-client](https://github.com/siimon/prom-client/issues/142)
- [Prom-client high memory usage · Issue #611 · siimon/prom-client](https://github.com/siimon/prom-client/issues/611)
- [Memory leak with default labels · Issue #287 · siimon/prom-client](https://github.com/siimon/prom-client/issues/287)

### Cluster Mode & Worker Aggregation
- [Prom-Client aggregation causing master to choke in cluster mode · Issue #628](https://github.com/siimon/prom-client/issues/628)
- [AggregatorRegistry assumes all workers will have metrics setup · Issue #181](https://github.com/siimon/prom-client/issues/181)
- [Failed cluster worker resets counter values in AggregatorRegistry · Issue #385](https://github.com/siimon/prom-client/issues/385)

### Event Loop & collectDefaultMetrics Issues
- [Very long NodeJS event loop lag · Issue #543 · siimon/prom-client](https://github.com/siimon/prom-client/issues/543)
- [Improve Event Loop Lag Metric · Issue #370 · siimon/prom-client](https://github.com/siimon/prom-client/issues/370)
- [Metrics | Node.JS Reference Architecture](https://nodeshift.dev/nodejs-reference-architecture/operations/metrics/)

### STDIO Transport & Stdout Contamination
- [MCP server stdio mode corrupted by stdout log messages · Issue #835](https://github.com/ruvnet/claude-flow/issues/835)
- [How to log the MCP JSON protocol over stdio | Volito](https://volito.digital/how-to-log-the-mcp-json-protocol-over-stdio/)
- [ExMCP Troubleshooting Guide — ex_mcp v0.7.4](https://hexdocs.pm/ex_mcp/troubleshooting.html)
- [Understanding MCP Through Raw STDIO Communication](https://foojay.io/today/understanding-mcp-through-raw-stdio-communication/)

### Security & Metrics Endpoint Protection
- [How To Set Up And Secure Prometheus Metrics Endpoints | Better Stack](https://betterstack.com/community/questions/set-up-and-secure-prometheus-metrics-endpoints/)
- [Securing Prometheus Deployments: Best Practices | Medium](https://medium.com/@platform.engineers/securing-prometheus-deployments-best-practices-for-authentication-and-authorization-e8ff3cd3eadb)
- [Security model | Prometheus](https://prometheus.io/docs/operating/security/)
- [Stop exposing your Node.js metrics 🛑 - DEV Community](https://dev.to/umarov/stop-exposing-your-nodejs-metrics-3fj)

### Histogram Configuration & Best Practices
- [Histogram Buckets in Prometheus Made Simple | Last9](https://last9.io/blog/histogram-buckets-in-prometheus/)
- [Histograms and summaries | Prometheus](https://prometheus.io/docs/practices/histograms/)
- [What is a Bucket in Prometheus - A Beginner's Guide | SigNoz](https://signoz.io/guides/what-is-a-bucket-in-prometheus/)

### Registry & Singleton Issues
- [Override globalRegistry · Issue #265 · siimon/prom-client](https://github.com/siimon/prom-client/issues/265)
- [Avoid Prometheus mess in NestJS | Medium](https://medium.com/elementor-engineers/avoid-prometheus-mess-in-nestjs-1ea368e3e21e)
- [GitHub - siimon/prom-client: Prometheus client for node.js](https://github.com/siimon/prom-client)

### Separate Port Architecture
- [Port Management in Node.js: Running Multiple Servers Like a Pro - DEV](https://dev.to/sudiip__17/-port-management-in-nodejs-running-multiple-servers-like-a-pro-ilc)
- [Separate metrics server and API server (different ports) · Issue #1411](https://github.com/sigp/lighthouse/issues/1411)

### General Best Practices
- [Node.js Performance Monitoring with Prometheus - RisingStack](https://blog.risingstack.com/node-js-performance-monitoring-with-prometheus/)
- [Monitoring Node.js Apps with Prometheus | Better Stack Community](https://betterstack.com/community/guides/scaling-nodejs/nodejs-prometheus/)
- [Monitoring Node.js: Key Metrics You Should Track | Last9](https://last9.io/blog/node-js-key-metrics/)
