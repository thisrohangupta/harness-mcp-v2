# External Integrations

**Analysis Date:** 2026-03-19

## APIs & External Services

**Harness.io Platform:**
- Base URL: `https://app.harness.io` (configurable via HARNESS_BASE_URL)
- Self-managed support via HARNESS_BASE_URL and HARNESS_ALLOW_HTTP config
- SDK/Client: Custom `HarnessClient` class (`src/client/harness-client.ts`)
- Auth: API Key (x-api-key header) or JWT Bearer token
- API Versions:
  - NG API: `/ng/api/...` (next-gen stable endpoints)
  - Pipeline API: `/pipeline/api/...`
  - Gateway: `/gateway/...` (log service, intelligence service)
  - v1 Beta: `/v1/...` (some newer endpoints)

**Harness Intelligence Service:**
- Endpoint: `/gateway/harness-intelligence/api/v1/chat/platform`
- Purpose: AI chat interface for pipeline debugging, optimization, creation
- Client: `IntelligenceClient` (`src/client/intelligence-client.ts`)
- Streaming: Server-Sent Events (SSE) for real-time responses
- Scope Parameters: orgIdentifier, projectIdentifier (injected from harness_context)
- Timeout: 5 minutes (300_000ms)

**Split.io (Feature Flag Management Engine - FME):**
- Base URL: `https://api.split.io` (configurable via HARNESS_FME_BASE_URL)
- Purpose: Feature flag evaluation and management
- Auth: Inherited from Harness API key or Bearer token (via baseUrlOverride)
- Integration: Feature flags toolset (`src/registry/toolsets/feature-flags.ts`)
  - FME API resources marked with `baseUrlOverride: "fme"`
  - Automatic base URL switching in request dispatch

## Data Storage

**No Internal Databases:**
- This is an MCP server (stateless protocol adapter)
- No persistent database layer
- All state lives in Harness.io backend

**Session Management (HTTP Mode Only):**
- In-memory session store: `Session` interface in `src/index.ts`
  - Maps session IDs to MCP server instances
  - Cleaned up on session disconnect
  - Used to maintain multi-session HTTP transport

**Client-Side Rate Limiting:**
- RateLimiter class (`src/utils/rate-limiter.ts`)
- Configurable RPS: HARNESS_RATE_LIMIT_RPS (default 10 requests/second)

## Authentication & Identity

**Auth Provider:**
- Dual-mode: API Key OR JWT Bearer tokens

**API Key Authentication:**
- Personal Access Token (PAT) format: `pat.<accountId>.<tokenId>.<secret>`
- Account ID auto-extracted from PAT or explicit HARNESS_ACCOUNT_ID
- Header injection: `x-api-key: <token>`
- Also sets `Harness-Account` header with accountId
- Implementation: `src/client/harness-client.ts` (lines 71-76)

**JWT Bearer Token Authentication (HTTP Mode):**
- JwtValidator class (`src/auth/jwt.ts`)
- Token validation: signature, expiration, issuer, audience, required claims
- Supported algorithms: HS256 (default), RS256, ES256
- Secret must be minimum 32 characters (enforced in config validation)
- Header injection: `Authorization: Bearer <token>`
- Claims extraction: type (required), sub, aud, iss, account_id, org_id, project_id
- Implementation details in `src/auth/principal.ts` (JwtClaims interface)
- Per-request account ID override from JWT claims (enables multi-tenant HTTP mode)

**HTTPS Enforcement:**
- Required for JWT Bearer token auth (config validation in `src/config.ts`)
- Optional for API key auth (can override with HARNESS_ALLOW_HTTP for local dev)
- Prevents credential exposure over HTTP

## Monitoring & Observability

**Error Tracking:**
- None (not integrated with external error tracking service)
- Errors surface via MCP protocol to client

**Logging:**
- stderr-only logger (`src/utils/logger.js`)
- CRITICAL: stdout reserved for JSON-RPC MCP protocol
- Structured logging with levels: debug, info, warn, error
- Log prefix pattern shows module name (e.g., "harness-client", "registry")
- Request/response logging at debug level (path, status, timing)

**Request Tracing:**
- correlationId extraction from Harness API responses
- Included in error messages for debugging
- Not sent to external tracing service

**Health Checks (HTTP Mode):**
- Endpoint: GET /health
- Docker HEALTHCHECK: wget -qO- http://localhost:3000/health every 30s

## CI/CD & Deployment

**Hosting:**
- Docker container (node:22-alpine base)
- Kubernetes-ready (multi-stage build, health checks, non-root user)
- npm package distribution

**CI Pipeline:**
- None detected in repo (no GitHub Actions workflow)
- Local development only

**Deployment Transports:**
- Stdio mode: Single persistent connection (Claude Desktop integration)
- HTTP mode: Multi-session remote deployment (Express adapter)

## Webhooks & Callbacks

**Incoming:**
- GET /health - Health check (HTTP mode)
- POST /mcp - JSON-RPC MCP requests (HTTP mode)
- GET /mcp - SSE stream for server-initiated messages (progress, elicitation)

**Outgoing:**
- None detected
- MCP server only receives requests from clients

## Rate Limiting

**Client-Side:**
- RateLimiter enforces HARNESS_RATE_LIMIT_RPS (default 10 req/s)
- Token bucket pattern with configurable capacity
- All requests pass through `rateLimiter.acquire()` in HarnessClient

**Server-Side (Harness API):**
- Retry on HTTP 429 (rate limit response)
- Exponential backoff with jitter: 1s → 2s → 4s
- Max retries: HARNESS_MAX_RETRIES (default 3)
- Backoff formula: `BASE_BACKOFF_MS * Math.pow(2, attempt - 1) * (0.5 + Math.random() * 0.5)`

## Harness API Scope Model

**Three-Tier Hierarchy:**
1. Account (required, from HARNESS_ACCOUNT_ID)
2. Organization (optional, defaults to HARNESS_DEFAULT_ORG_ID = "default")
3. Project (optional, defaults to HARNESS_DEFAULT_PROJECT_ID)

**Scope Injection:**
- Every request includes: accountIdentifier (as header `Harness-Account` + query param)
- Most requests include: orgIdentifier, projectIdentifier (query params)
- HarnessClient handles automatic injection
- Tools accept optional org/project overrides

## Request/Response Patterns

**Request Headers:**
```
x-api-key: <token>           # API key auth (if used)
Authorization: Bearer <jwt>  # JWT auth (if used, takes precedence)
Harness-Account: <accountId> # Always set
Content-Type: application/json | application/yaml
```

**Response Envelope (Harness NG API):**
```json
{
  "status": "SUCCESS|ERROR|FAILURE",
  "data": { ... },
  "message": "optional message",
  "code": "optional error code",
  "correlationId": "for debugging"
}
```

**Paginated Response:**
```json
{
  "status": "SUCCESS",
  "data": {
    "content": [...],
    "totalElements": 100,
    "totalPages": 5,
    "pageIndex": 0,
    "pageSize": 20
  }
}
```

**Pagination Params:**
- Query params: `page` (0-indexed), `size` (default 30, max 100)
- v1 beta: `limit` (default 30, max 100) + `page`
- Response headers: X-Total-Elements, X-Page-Number, X-Page-Size

## Harness Toolsets (API Coverage)

The server wraps 27 Harness API domains via the Registry system:

1. **pipelines** - Pipeline CRUD, execution, input sets
2. **services** - Service definitions
3. **environments** - Environment entity management
4. **infrastructure** - Infrastructure definitions
5. **connectors** - Connector management
6. **secrets** - Secret metadata (read-only)
7. **logs** - Execution log retrieval
8. **audit** - Audit trail queries
9. **delegates** - Delegate health and status
10. **repositories** - Git repository integration
11. **registries** - Artifact registries (Docker, Helm, etc.)
12. **templates** - Template management
13. **dashboards** - Dashboard queries
14. **idp** - Internal developer platform
15. **pull-requests** - PR integration (GitHub, GitLab)
16. **feature-flags** - Feature flag management (via Split.io FME)
17. **gitops** - GitOps pipeline management (ArgoCD, Flux)
18. **chaos** - Chaos engineering experiments
19. **ccm** - Cloud cost management
20. **sei** - Software engineering insights
21. **scs** - Supply chain security
22. **sto** - Security testing orchestration
23. **access-control** - RBAC and access policies
24. **settings** - Platform settings
25. **platform** - Platform-level operations
26. **intelligence** - AI chat and diagnostics
27. **visualizations** - Diagram/visualization rendering

## Caching

**None Detected:**
- No external caching service (Redis, Memcached)
- Requests flow directly to Harness API
- Rate limiter uses in-memory token bucket

## External SDKs

**JWT Library:**
- jsonwebtoken 9.0.3 - Token creation, verification, claims extraction

**MCP SDK:**
- @modelcontextprotocol/sdk 1.27.1 - Complete MCP server implementation
  - Server definition (McpServer)
  - Transport layers (StdioServerTransport, StreamableHTTPServerTransport, Express)
  - Error mapping (McpError, ErrorCode)
  - Types (ServerRequest, ServerNotification, RequestHandlerExtra)

---

*Integration audit: 2026-03-19*
