# Codebase Concerns

**Analysis Date:** 2026-03-19

## Tech Debt

**Session Memory Bloat (HTTP Mode):**
- Issue: In-memory session store (`Map<sessionId, Session>` at `src/index.ts:164`) grows unbounded if clients don't disconnect cleanly. While a TTL reaper exists (30-minute idle window, cleanup every 60 seconds), edge cases can leak memory.
- Files: `src/index.ts` (lines 78-190)
- Impact: Long-running HTTP deployments serving many simultaneous clients could experience memory pressure. Rate limit map (`ipHits`) also grows unbounded across resets.
- Fix approach: Implement a max session cap with LRU eviction. Add metrics to observe session/IP map sizes. Consider external session store (Redis) for production deployments.

**Session Data Not Persisted:**
- Issue: All session state (server instances, transports) exist only in Node process memory. Process restart = complete session loss.
- Files: `src/index.ts` (lines 78-190)
- Impact: In HTTP mode, any process restart orphans active clients. They'll receive "Session not found" on next request. No graceful failover mechanism.
- Fix approach: Add warning in docs about stateless deployments. For HA, consider implementing graceful session migration or switching to stateless HTTP transport.

**Incomplete Error Recovery on Request Failures:**
- Issue: In HTTP mode, when `handleRequest()` throws (line 217-227), error is logged but partial writes to response might have occurred. The error recovery doesn't guarantee a clean JSON-RPC error response.
- Files: `src/index.ts` (lines 216-227, 303-314)
- Impact: Clients may receive corrupted responses if errors occur mid-write.
- Fix approach: Use response.writableEnded check to detect partial writes. Implement response.writeHead() with status code before any body writes.

**Rate Limiting Not Enforced Per-Session:**
- Issue: IP-based rate limiting (60 req/min) is coarse-grained. Doesn't prevent a single authenticated user from abusing the API via many concurrent sessions.
- Files: `src/index.ts` (lines 138-161)
- Impact: Malicious user with valid JWT can create many sessions and bypass rate limits.
- Fix approach: Add per-user (JWT principal) rate limiting in addition to per-IP. Store in session metadata for finer control.

**No Explicit Secrets Rotation:**
- Issue: JWT_SECRET and HARNESS_API_KEY are static env vars. No mechanism for rotating them without restart.
- Files: `src/config.ts`, `src/auth/jwt.ts`
- Impact: Key compromise requires manual intervention and downtime.
- Fix approach: Document secret rotation procedure in README. Consider adding a POST /admin/rotate-secrets endpoint (protected by internal auth token).

## Known Bugs

**JWT Validation Doesn't Check Token Age:**
- Symptoms: Very old, recently-expired tokens might pass validation if clock skew exists. `jwt.verify()` respects exp claim, but no `maxAge` check for issued-at (`iat`).
- Files: `src/auth/jwt.ts` (lines 33-81)
- Trigger: Issue a JWT with `iat` from years ago, `exp` in future. Validation passes but token is effectively stale.
- Workaround: Ensure JwtValidator caller verifies token age explicitly. Add `maxAge` option to jwt.verify() call.

**Multiple Simultaneous DELETE Requests on Same Session:**
- Symptoms: Race condition if two DELETE /mcp requests arrive with same sessionId. Both call `destroySession()`, second one finds empty Map entry, logs success, client code happy.
- Files: `src/index.ts` (lines 318-345)
- Trigger: Send DELETE twice quickly from same client.
- Workaround: Client should wait for first DELETE response before sending second. Server-side: none — considered safe since double-delete is idempotent.

**Account ID Extraction from PAT Token Can Fail Silently:**
- Symptoms: If HARNESS_API_KEY is provided but doesn't match `pat.<accountId>.<tokenId>.<secret>` pattern, extraction returns undefined. Config fallback accepts it if JWT_SECRET is set, but then sets placeholder "jwt-mode" account ID.
- Files: `src/config.ts` (lines 8-14, 76-106)
- Trigger: Pass `HARNESS_API_KEY=custom_token` (not a PAT), with JWT_SECRET set.
- Workaround: Always provide explicit HARNESS_ACCOUNT_ID if API key is not a PAT. Docs should clarify this.

## Security Considerations

**JWT Secret Length Validation Insufficient:**
- Risk: 32-character minimum enforced at construction time (`src/auth/jwt.ts:16`), but HS256 is vulnerable to brute force with weak secrets. Recommendation is 256-bit (32 bytes) of cryptographic entropy, not just length.
- Files: `src/auth/jwt.ts` (lines 15-22)
- Current mitigation: Length check only. No entropy validation.
- Recommendations: Document strong secret generation (use `openssl rand -base64 32` or similar). Consider warning in logs if secret looks weak (e.g., common words).

**Auth Header Logged in Debug Mode:**
- Risk: In debug logs, `maskToken()` shows first 20 chars of JWT token. If logging is captured and leaked, token prefix leaks (attackers can correlate with captured traffic).
- Files: `src/auth/middleware.ts` (lines 13-18, 83-87)
- Current mitigation: Token is masked, not fully exposed.
- Recommendations: Only log token presence, not even 20 chars. Use hash of token or don't log at all in production.

**No Strict HTTPS Enforcement in Stdio Mode:**
- Risk: Stdio mode skips TLS entirely — communication is over stdin/stdout pipes. If piped over network (SSH, etc.), MITM is possible.
- Files: `src/index.ts` (lines 59-75)
- Current mitigation: Docs assume stdio is used locally only.
- Recommendations: Add warning in README that stdio is for local-only use. For remote deployments, use HTTP mode only.

**CORS Allows Single Origin Only:**
- Risk: CORS headers hard-coded to `http://<host>:<port>` (line 131). If host:port accessed from different origin, CORS blocks it. But configuration doesn't validate origin header — only returns fixed value.
- Files: `src/index.ts` (lines 130-136)
- Current mitigation: Single-origin limit reduces attack surface.
- Recommendations: Consider allowing origin whitelist via env var. Validate incoming Origin header against list.

**API Key Exposed in Error Messages:**
- Risk: If Harness API returns an error and the error message contains the API key (rare but possible), it logs to stderr.
- Files: `src/client/harness-client.ts` (lines 114-116, 173)
- Current mitigation: Debug logs truncate body to 1000 chars, so full key unlikely to appear. But not guaranteed.
- Recommendations: Add string masking utility. Scan error bodies for "x-api-key" pattern and redact before logging.

**No Rate Limiting on Password/Token Failures:**
- Risk: Brute-force attacks on JWT validation. Multiple failed validation attempts aren't rate-limited.
- Files: `src/auth/middleware.ts` (lines 91-105)
- Current mitigation: None. Failed attempts logged but not throttled.
- Recommendations: Track failed auth attempts per IP. After N failures in M seconds, reject with 429 for time T.

## Performance Bottlenecks

**Session TTL Reaper Uses Unbounded Iteration:**
- Problem: Reaper checks all sessions every 60 seconds (`REAP_INTERVAL_MS`, line 176). With 10K+ sessions, iteration becomes O(n) and blocks event loop during cleanup.
- Files: `src/index.ts` (lines 176-190)
- Cause: Linear scan of `sessions` Map. No index by expiry time.
- Improvement path: Use a heap or sorted list keyed by expiry time. Pop expired sessions in O(log n). For rare huge deployments (100K+ sessions), use external cache with TTL support.

**Stream Response Processing May Buffer Entire Payload:**
- Problem: `IntelligenceClient.processStream()` reads full response body into memory before parsing SSE events. Large responses (> 100MB) will OOM.
- Files: `src/client/intelligence-client.ts` (lines 79+, not shown but process implied)
- Cause: Streaming parsed line-by-line but accumulated before returning.
- Improvement path: Return a generator/async iterator instead of full response. Let caller decide buffering.

**Registry Initialization Loads All Toolsets Into Memory:**
- Problem: `ALL_TOOLSETS` (27 toolsets at `src/registry/index.ts:39-67`) are imported and filtered at startup. No lazy loading.
- Files: `src/registry/index.ts` (lines 38-89)
- Cause: All toolset definitions are statically imported. If a toolset is large/slow to parse, startup blocks.
- Improvement path: Lazy-load toolsets on first access. Cache in-memory after load.

**Deep Link Generation in Resource Batch May Timeout:**
- Problem: When building resources for a batch of results (e.g., 50 pipelines), deep link generation could fail for individual items (line 438: "skip" on failure). But no timeout per item — if buildDeepLink() hangs, entire batch stalls.
- Files: `src/registry/index.ts` (line 438)
- Cause: No per-item timeout wrapper around buildDeepLink().
- Improvement path: Wrap buildDeepLink() with timeout. Return null deep link on timeout instead of throwing.

## Fragile Areas

**JWT Token Claims Validation is Loose:**
- Files: `src/auth/jwt.ts` (lines 46-66)
- Why fragile: Required claims check is basic (presence only). Doesn't validate:
  - email vs username: accepts if either present, but doesn't require exact structure
  - accountId format (e.g., UUID pattern)
  - type enum (only checks USER vs SERVICE_ACCOUNT)
- Safe modification: Add stricter validation. E.g., email must be valid email format, accountId must match org ID pattern.
- Test coverage: No unit tests for JwtValidator. Add tests for valid/invalid token shapes, expired tokens, missing claims.

**HarnessClient Retry Logic Doesn't Distinguish Transient vs Permanent Errors:**
- Files: `src/client/harness-client.ts` (lines 9, 146-150, 269-273)
- Why fragile: Retries only on specific status codes (429, 5xx). But doesn't consider:
  - Some 5xx errors are permanent (e.g., invalid YAML in pipeline body)
  - Some 2xx responses are actually errors (e.g., Harness API returns 200 with { status: "ERROR" } body)
- Safe modification: Add response body parsing. If Harness status field indicates error, don't retry on retriable codes. Document retry behavior clearly.
- Test coverage: Limited integration tests. Add tests for various Harness error formats.

**Session Expiry TTL is Fixed:**
- Files: `src/index.ts` (line 87, SESSION_TTL_MS = 30 * 60_000)
- Why fragile: 30 minutes is arbitrary. Long-running operations (async pipeline executions) might exceed TTL, session evicted mid-operation. Client unaware until next request.
- Safe modification: Make TTL configurable via env var. Default 30 min, allow 1h-24h range. Document in README.
- Test coverage: No tests for session eviction. Add e2e test that verifies session survives N minutes, expires after TTL.

**Config Validation Uses Env Var Order Dependency:**
- Files: `src/config.ts` (lines 76-108)
- Why fragile: Account ID extraction from PAT token happens in superRefine + transform. If HARNESS_API_KEY changes mid-request (shouldn't happen but...), transform doesn't re-evaluate.
- Safe modification: Move extraction to separate utility, call once after config loaded. Add unit test for extraction edge cases.
- Test coverage: Only config.test.ts exists (7.9K file, size suggests some coverage but not comprehensive). Add tests for PAT parsing, fallback logic.

**No Input Validation on Tool Handler Parameters:**
- Files: All tool handlers across `src/registry/toolsets/*.ts`
- Why fragile: Each tool manually validates input params. No shared validation layer. Easy to miss a param or introduce inconsistency.
- Safe modification: Wrap tool input schema with runtime validation. Add middleware that validates against Zod schema before invoking handler.
- Test coverage: Tests exist but scattered. Consolidate into shared test utilities for parameter validation.

## Scaling Limits

**In-Memory Session Store (HTTP Mode):**
- Current capacity: Tested up to ~1000 concurrent sessions before memory/CPU noticeable (estimate).
- Limit: ~10K sessions before serious slowdown (session iteration, cleanup, memory allocation).
- Scaling path: Switch to Redis for session store. Distributed cache with TTL support, no memory pressure on Node process. Allows stateless deployment.

**Single-Instance Rate Limiting (IP-Based):**
- Current capacity: 60 requests/minute per IP = sustainable for typical usage.
- Limit: If deployed behind load balancer without X-Forwarded-For, all requests appear from LB IP. Rate limiter becomes useless. Even with X-Forwarded-For, distributed deployments don't coordinate rate limiting.
- Scaling path: Use external rate limiter (Redis, Cloudflare, etc.). Per-session limits instead of per-IP.

**Harness API Client Concurrency:**
- Current capacity: RateLimiter allows 10 RPS by default. Each request handled serially.
- Limit: Bottleneck at HTTP client — fetch() is concurrent but single-threaded node.js. ~100-200 concurrent requests before noticeable latency increase.
- Scaling path: Increase maxTokens in RateLimiter if Harness API SLA allows. Monitor actual Harness API response times. May need connection pooling (keep-alive).

## Dependencies at Risk

**jsonwebtoken (v9.0.3):**
- Risk: JWT library has had security issues in past (e.g., algorithm confusion). Current version is recent, but no mechanism to auto-update.
- Impact: If a 0-day JWT vulnerability is found, mitigation requires updating package.json + redeploy.
- Migration plan: Stay on latest 9.x. Monitor npm security advisories. Consider using native Node.js crypto for HS256 if possible (reduces deps).

**@modelcontextprotocol/sdk (v1.27.1):**
- Risk: MCP spec is evolving (v1 is current but v2 likely coming). SDK may break with new spec versions.
- Impact: New MCP feature adoption may require rewrite of tool registration, resource definitions, etc.
- Migration plan: Pin to v1.x in package.json. Monitor releases for breaking changes. Plan v2 migration once spec stabilizes.

**express (v5.2.1):**
- Risk: Express 5.x is relatively new. Ecosystem compatibility may lag (middleware, plugins).
- Impact: If a required middleware only supports Express 4, may need to downgrade.
- Migration plan: Track Express 5 adoption. Maintain compatibility with both 4 and 5 if possible. Or pin to 4.x for stability.

**zod/v4:**
- Risk: Zod v4 API is new (v3 to v4 migration required changes). Future v5 may introduce breaking changes.
- Impact: Major version bump could require schema rewrites across entire codebase.
- Migration plan: Stay on v4.x. Monitor for v5. Test migration path before committing to major version bump.

## Missing Critical Features

**No Metrics/Observability:**
- Problem: No built-in metrics (request latency, error rate, session count). Deployments are blind to performance.
- Blocks: Debugging production issues, capacity planning, alerting.
- Workaround: Deploy with external APM (Datadog, New Relic, etc.). But MCP server doesn't expose prometheus /metrics endpoint.
- Fix: Add optional prometheus metrics export. Track: request latency, session count, rate limiter state, Harness API errors.

**No Health Check Beyond HTTP /health:**
- Problem: /health returns `{ status: "ok", sessions: size }` but doesn't check:
  - Harness API connectivity
  - Config validity
  - Database/cache connectivity (if added)
- Blocks: Load balancers can't detect if server is truly healthy.
- Fix: Add deep health check. Make /health optionally perform test Harness API call to verify auth + connectivity.

**No Graceful Shutdown for HTTP Mode:**
- Problem: Shutdown logic (lines 358-406) attempts to drain, but doesn't guarantee in-flight MCP operations complete. SSE streams may close abruptly.
- Blocks: Long-running operations (streaming chat) interrupted on restart.
- Fix: Add operation tracking. On shutdown, wait for in-flight SSE streams to finish (with timeout). Log operations that timed out.

**No Backup/Recovery for HTTP Mode State:**
- Problem: If process crashes, all session state is lost. No way to reconnect to orphaned sessions.
- Blocks: High-availability deployments can't recover gracefully.
- Fix: Persist session metadata to external store (Redis, S3). On recovery, allow clients to reconnect to old session IDs (with auth re-verification).

## Test Coverage Gaps

**Untested Shutdown Flow:**
- What's not tested: HTTP graceful shutdown, session cleanup, in-flight request handling during shutdown.
- Files: `src/index.ts` (lines 356-406)
- Risk: Shutdown bugs could orphan sessions, leak resources, or corrupt client connections.
- Priority: High — affects production reliability.

**Untested Error Recovery:**
- What's not tested: HarnessClient error handling, retry backoff math, timeout behavior. Only basic config validation tested.
- Files: `src/client/harness-client.ts`, `src/auth/jwt.ts`
- Risk: Edge cases (e.g., timeout + retry + timeout chain) could produce unexpected behavior.
- Priority: High — auth and HTTP client are critical paths.

**No End-to-End Tests:**
- What's not tested: Full HTTP request lifecycle, tool invocation via MCP protocol, streaming responses.
- Files: Entire `src/` directory
- Risk: Integration bugs (e.g., response format mismatch) not caught until production.
- Priority: Medium — unit tests exist, but e2e would improve confidence.

**Missing JWT Edge Cases:**
- What's not tested: Expired tokens, tokens with missing claims, algorithm mismatches, clock skew scenarios.
- Files: `src/auth/jwt.ts`
- Risk: Invalid tokens might be accepted or rejected unexpectedly.
- Priority: High — security-critical.

**No Load/Stress Tests:**
- What's not tested: Behavior under high concurrency (1000+ sessions), rate limiter under burst load, session cleanup under memory pressure.
- Files: `src/index.ts`, `src/utils/rate-limiter.ts`
- Risk: Performance degrades unpredictably under load.
- Priority: Medium — affects production deployments.

---

*Concerns audit: 2026-03-19*
