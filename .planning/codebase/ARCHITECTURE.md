# Architecture

**Analysis Date:** 2026-03-19

## Pattern Overview

**Overall:** Multi-layer MCP (Model Context Protocol) server with registry-driven resource abstraction and transport multiplexing.

**Key Characteristics:**
- Single HTTP client abstraction layer that handles all Harness API communication with auth, retry, and rate limiting
- Registry pattern for declarative resource and operation definitions, eliminating boilerplate tool code
- Transport-agnostic server creation (stdio and HTTP/Express both supported)
- Stateful session management for HTTP transport with TTL-based cleanup and per-IP rate limiting
- Zod v4 schema validation at entry points with custom error mapping to MCP-compatible responses
- JWT and API key authentication modes with per-request context propagation

## Layers

**MCP Server Layer (Entrypoint):**
- Purpose: Create and configure MCP server instance, register tools/resources/prompts, manage transport selection
- Location: `src/index.ts`
- Contains: Server factory, stdio/HTTP transport setup, session lifecycle management
- Depends on: McpServer SDK, Registry, HarnessClient, Auth context
- Used by: Node.js process entry point

**Configuration & Auth Layer:**
- Purpose: Load and validate environment configuration, manage JWT/API key authentication, propagate auth context
- Location: `src/config.ts`, `src/auth/`, `src/auth/principal.ts`, `src/auth/middleware.ts`, `src/auth/jwt.ts`
- Contains: Zod config schema with HTTPS enforcement, JWT validator, auth middleware
- Depends on: jsonwebtoken (JWT validation), Zod schemas
- Used by: Main server, HTTP middleware, HarnessClient

**HTTP Client Layer:**
- Purpose: Unified HTTP communication with Harness API — handles authentication, retries, rate limiting, error normalization
- Location: `src/client/harness-client.ts`, `src/client/types.ts`
- Contains: Single `HarnessClient` class with request dispatch, exponential backoff retry logic, auth header injection
- Depends on: Config (base URL, token, timeout, retry count), RateLimiter, error utilities
- Used by: Registry dispatch, all tools and resources

**Registry & Dispatch Layer:**
- Purpose: Declaratively define resources and operations (list, get, create, update, delete), provide polymorphic dispatch to the correct endpoint
- Location: `src/registry/index.ts`, `src/registry/types.ts`, `src/registry/extractors.ts`, `src/registry/toolsets/`
- Contains: 27 toolset files (pipelines, services, environments, connectors, etc.), resource definitions with endpoint specs
- Depends on: HarnessClient, response extractors
- Used by: Tools (harness_list, harness_get, harness_create, etc.)

**Tool Layer (MCP Tools):**
- Purpose: Implement MCP tool handlers that accept user input, dispatch to registry, format responses
- Location: `src/tools/`
- Contains: Generic tools (harness_list, harness_get, harness_create, harness_update, harness_delete, harness_execute, harness_diagnose, harness_search, harness_describe, harness_status, harness_ask)
- Depends on: Registry, HarnessClient, response formatters, error utilities
- Used by: MCP server to expose tools to agents

**Resource Layer (MCP Resources):**
- Purpose: Provide read-only data and schemas that agents can reference without tool calls
- Location: `src/resources/`
- Contains: Pipeline YAML resource, execution summary resource, Harness schema resource
- Depends on: Registry, HarnessClient
- Used by: MCP server to expose resources to agents

**Prompt Layer (MCP Prompts):**
- Purpose: Provide curated multi-turn prompts for common tasks (debug pipeline, create pipeline, optimize costs, etc.)
- Location: `src/prompts/`
- Contains: 25+ prompt templates grouped by domain (DevOps, FinOps, DevSecOps, Harness Code, Approvals)
- Depends on: MCP server interface only
- Used by: MCP server to expose prompts to agents

**Utilities Layer:**
- Purpose: Cross-cutting concerns — logging, error handling, URL parsing, response formatting, SVG charts, deep links
- Location: `src/utils/`
- Contains: Structured logger (stderr-only), error mapping, response formatters, URL defaults, type guards, SVG chart rendering
- Depends on: None (leaf layer)
- Used by: All other layers

## Data Flow

**Tool Execution (List Operation):**

1. **User Request** → MCP `harness_list` tool invoked with `resource_type`, filters, pagination
2. **Tool Input Validation** → Zod schema validates input, auto-parses Harness UI URLs (org/project extraction)
3. **Registry Dispatch** → Tool calls `registry.dispatch(client, resource_type, "list", input)`
4. **Endpoint Resolution** → Registry looks up toolset resource definition, retrieves "list" operation spec
5. **Path & Query Building** → EndpointSpec generates full URL (path template expansion, query params injection)
6. **HTTP Request** → `HarnessClient.request()` executes:
   - Rate limiter acquires slot
   - Injects auth headers (JWT or API key)
   - Adds Harness-Account header
   - Retries on transient failures (429, 5xx) with exponential backoff
7. **Response Extraction** → Toolset's `responseExtractor` normalizes Harness API response to clean JSON
8. **Compaction (Optional)** → Strip verbose metadata from list items (configurable)
9. **Visual Rendering (Optional)** → If requested, generate inline PNG chart (timeseries, pie, bar)
10. **Response Format** → Return `{ items: [...], total: N, page: N }` or mixed result (JSON + SVG)
11. **Error Handling** → Catch and normalize errors: user errors → client error response, API errors → detailed MCP error

**Tool Execution (Write Operation - Create):**

1. **User Request** → MCP `harness_create` tool with `resource_type`, body, optional params
2. **Input Validation** → Zod schema validates structure (advisory — actual shape determined by toolset)
3. **Body Building** → Toolset's `bodyBuilder` transforms input (YAML string vs JSON, query param extraction)
4. **Confirmation Gate** → If write operation, require `confirmation: true` input param (security)
5. **HTTP Request** → POST/PUT via HarnessClient with built body
6. **Response Extraction** → Normalized response
7. **Audit Log** → Structured audit entry logged to stderr

**Session Lifecycle (HTTP Transport):**

1. **Client Initialization** → POST /mcp with JSON-RPC `initialize` message, no session header
2. **Server Creates Session** → Generate UUID, instantiate MCP server + StreamableHTTPServerTransport, store in sessions map
3. **Subsequent Requests** → POST /mcp with `mcp-session-id` header, routed to stored transport
4. **SSE Stream** → GET /mcp with session header opens Server-Sent Events stream for server-initiated messages
5. **Idle Timeout** → TTL reaper marks sessions for destruction after 30 minutes inactivity
6. **Graceful Shutdown** → SIGTERM/SIGINT triggers:
   - Stop accepting new connections
   - Reject new requests with 503
   - Close all sessions
   - Wait up to 10s for in-flight responses to flush

**State Management:**

- **Config State** → Loaded once at startup, immutable, passed to client/registry/tools
- **Auth State** → Per-request (HTTP): attached to request object by JWT middleware; per-session (stdio): shared across all requests
- **Client State** → Single instance per server, manages rate limiter + retry backoff
- **Registry State** → Single instance per server, filters toolsets by HARNESS_TOOLSETS env var, caches resource definitions
- **Session State** → Map of { sessionId → { server, transport, lastActivity, authContext } }; reaped on TTL

## Key Abstractions

**ToolsetDefinition:**
- Purpose: Declarative specification of a domain (pipelines, services, connectors, etc.)
- Examples: `src/registry/toolsets/pipelines.ts`, `src/registry/toolsets/services.ts`
- Pattern: Export `{ name, displayName, description, resources: ResourceDefinition[] }`
- Each resource contains endpoint specs for list/get/create/update/delete operations

**ResourceDefinition:**
- Purpose: Metadata + endpoint specs for a single resource type (pipeline, service, environment, etc.)
- Pattern: `{ resourceType, displayName, scope, operations: { list: EndpointSpec, get: EndpointSpec, ... }, listFilterFields, identifierFields, deepLinkTemplate }`
- Each operation spec includes HTTP method, path template, param mappings, body/response builders

**EndpointSpec:**
- Purpose: Map a CRUD operation to a Harness API endpoint
- Pattern: `{ method, path, pathParams, queryParams, bodyBuilder, responseExtractor, description }`
- Supports dynamic path builders for multi-endpoint resources (e.g., git vs inline pipelines)

**ResponseExtractor:**
- Purpose: Normalize Harness API response structure to clean JSON
- Pattern: Function type `(response: unknown) => T`
- Examples: `ngExtract` (unwraps `{ data: {...} }`), `pageExtract` (handles pagination metadata), `v1ListExtract` (API v1 format)

## Entry Points

**Stdio Transport:**
- Location: `src/index.ts` (`startStdio` function)
- Triggers: CLI `node build/index.js stdio` or default
- Responsibilities:
  - Create single MCP server instance
  - Connect to StdioServerTransport
  - Attach global signal handlers (SIGINT/SIGTERM)
  - Single persistent connection for entire lifetime

**HTTP Transport:**
- Location: `src/index.ts` (`startHttp` function)
- Triggers: CLI `node build/index.js http --port 3000`
- Responsibilities:
  - Create Express app with CORS, JSON middleware, rate limiting
  - Attach JWT auth middleware (optional, if JWT_SECRET set)
  - Implement POST /mcp (initialize + routing), GET /mcp (SSE), DELETE /mcp (teardown)
  - Manage session lifecycle with TTL reaper
  - Health check endpoint GET /health

**MCP Server Initialization:**
- Location: `src/index.ts` (`createHarnessServer` function)
- Triggers: Both stdio and HTTP paths call this
- Responsibilities:
  - Create HarnessClient instance with config + auth header
  - Create Registry instance with config
  - Register all tools via `registerAllTools`
  - Register all resources via `registerAllResources`
  - Register all prompts via `registerAllPrompts`

## Error Handling

**Strategy:** Convert Harness API errors to user-facing messages with actionable guidance. Never expose raw tokens or secrets.

**Patterns:**

- **HarnessApiError** (`src/utils/errors.ts`): Custom error class wrapping Harness API failures
  - Includes HTTP status, error code, message, correlation ID
  - Humanizes 401/403/404 errors with auth/permission guidance

- **Zod Validation Errors**: Caught at tool entry points, returned as MCP error results
  - Format: `"Invalid input: {field}: {reason}"`

- **User Error vs System Error**: Tools distinguish user input errors (return error result) vs system errors (throw to MCP error handler)
  - User errors: invalid resource_type, missing required params, 404 not found, validation failures
  - System errors: network timeouts, 5xx failures, unexpected response format

- **Error Result Format**: `{ content: [{ type: "text", text: "Human-readable error message" }], isError: true }`

## Cross-Cutting Concerns

**Logging:**
- Implementation: `src/utils/logger.ts` — structured JSON logging to stderr only (never stdout, as stdio transport uses stdout for JSON-RPC)
- Pattern: `createLogger("module")` → logger instance with debug/info/warn/error methods
- Format: `{ ts: ISO8601, level, module, msg, ...data }` as JSON strings
- Global level controlled by LOG_LEVEL env var

**Validation:**
- Zod v4 at all entry points (config, tools, HTTP middleware)
- Always call `.describe()` LAST in schema chain to preserve descriptions for LLM tool selection
- Custom refinements for auth mode (JWT XOR API key), HTTPS enforcement

**Authentication:**
- Two modes: JWT (per-request, via Authorization header) or API key (per-server, via x-api-key header)
- JWT middleware validates signature, extracts claims, attaches authContext to request object
- HarnessClient receives authHeader from config or request context, injects into Harness API calls
- Harness-Account header always set (from JWT claims or config)

**Rate Limiting:**
- Client-side: RateLimiter class with token bucket (default 10 req/sec configurable)
- Server-side (HTTP): Per-IP window (60 req/min), returns HTTP 429 with MCP error response
- Backoff: Exponential with jitter on transient failures (429, 5xx)

**Audit Logging:**
- Structured audit entries for all write operations (create, update, delete, execute)
- Format: `{ operation, resource_type, resource_id, action, org_id, project_id, outcome, error }`
- Logged via `logAudit()` to stderr

**Deep Linking:**
- Every resource definition includes `deepLinkTemplate` to Harness UI
- Tools automatically populate links in responses (`buildDeepLink()` utility)
- Agents can click through to Harness UI for detailed exploration

---

*Architecture analysis: 2026-03-19*
