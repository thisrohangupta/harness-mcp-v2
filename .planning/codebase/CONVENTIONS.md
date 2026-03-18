# Coding Conventions

**Analysis Date:** 2026-03-19

## Naming Patterns

**Files:**
- **Tool files**: `harness-{verb}.ts` (e.g., `harness-list.ts`, `harness-execute.ts`, `harness-create.ts`)
  - Located in `src/tools/`
  - One tool per file
  - Register function pattern: `register{Action}Tool()` (e.g., `registerListTool()`, `registerExecuteTool()`)
- **Utility files**: kebab-case (e.g., `rate-limiter.ts`, `response-formatter.ts`, `type-guards.ts`)
- **Domain files**: descriptive names (e.g., `harness-client.ts`, `intelligence-client.ts`)
- **Test files**: same name as source with `.test.ts` suffix (e.g., `harness-client.test.ts` for `harness-client.ts`)

**Functions:**
- camelCase for all functions: `createLogger()`, `registerListTool()`, `compactItems()`, `applyUrlDefaults()`
- Export functions with descriptive names that indicate action
- Tool registration: always export a `register{Type}Tool()` function from each tool file

**Variables:**
- camelCase for constants and variables: `LOG_LEVELS`, `SESSION_TTL_MS`, `RETRYABLE_STATUS_CODES`
- UPPER_SNAKE_CASE for module-level constants, especially configuration values
- Prefixes for constants indicating type: `BASE_BACKOFF_MS`, `REAP_INTERVAL_MS`, `RATE_WINDOW_MS` for time values

**Types:**
- PascalCase for all type names: `HarnessClient`, `Registry`, `Config`, `Logger`, `HarnessApiError`
- Interface names describe the data structure: `RequestOptions`, `ChatOptions`, `AuditEntry`
- Prefix with capital letter for enum/union types

## Code Style

**Formatting:**
- No explicit linter/formatter configured (ESLint/Prettier not in repo)
- TypeScript strict mode enabled in `tsconfig.json`
- 2-space indentation (inferred from source code)
- Line length target appears to be ~100-120 characters (varied in practice)
- Semicolons always used to terminate statements

**TypeScript Configuration:**
- Target: ES2022
- Module: Node16 (ESM)
- Strict: true (enables all type checking)
- `noUncheckedIndexedAccess: true` prevents unsafe array indexing
- Declaration and source maps enabled for distribution
- Exclude: node_modules, build, tests

**Linting:**
- No ESLint or Prettier configs found in repository
- Follows TypeScript strict mode discipline as primary style enforcement
- Type safety is enforced through strict compilation

## Import Organization

**Order (enforced pattern across codebase):**
1. Node.js built-ins: `import { randomUUID } from "node:crypto"`
2. External packages: `import * as z from "zod/v4"`; `import { McpServer } from "@modelcontextprotocol/sdk/..."`
3. Type imports: `import type { Config } from "./config.js"`
4. Relative imports: `import { createLogger } from "./utils/logger.js"`
5. File extensions: Always include `.js` extension in imports (ESM requirement)

**Path Aliases:**
- No path aliases configured
- All imports use relative paths with `.js` extensions
- Pattern: `./utils/logger.js`, `../registry/index.js`, `../../src/config.js`

**Special Import Pattern:**
- Zod imports MUST use `import * as z from "zod/v4"` (not `import { z } from "zod"`)
- This is critical for accessing the v4 API explicitly
- Example: `z.string().describe("...").optional()` — `.describe()` called LAST before `.optional()` to preserve description

**Dynamic imports allowed for:**
- Optional features: `const { json } = await import("express")`
- Lazy-loaded modules: `const { JwtValidator } = await import("./auth/index.js")`

## Error Handling

**Patterns:**
- Use typed custom errors: `HarnessApiError` for HTTP failures with status, code, correlationId
- Constructor signature: `new HarnessApiError(message, statusCode, harnessCode?, correlationId?, cause?)`
- Errors propagate with context: `{ error: String(err) }` in logs

**Tool Error Returns (src/tools/):**
- User-fixable errors (validation, missing fields, 400/404 API): `return errorResult(message)`
- Infrastructure failures (401/403, 429, 5xx): `throw toMcpError(err)`
- User-error distinction via `isUserError()` and `isUserFixableApiError()` helpers in `src/utils/errors.ts`
- Pattern observed in `src/tools/harness-list.ts`:
  ```typescript
  try {
    const result = await registry.dispatch(client, resourceType, "list", input);
    return jsonResult(result);
  } catch (err) {
    if (isUserError(err)) return errorResult(err.message);
    if (isUserFixableApiError(err)) return errorResult(err.message);
    throw toMcpError(err);
  }
  ```

**HTTP Client Error Strategy (src/client/harness-client.ts):**
- Retry on: 429, 500, 502, 503, 504 (configurable max retries, default 3)
- Exponential backoff with jitter: `BASE_BACKOFF_MS * Math.pow(2, attempt - 1) * (0.5 + Math.random() * 0.5)`
- Non-JSON HTTP errors (HTML, WAF blocks): `humanizeHttpError()` provides actionable messages
- Connection abort vs timeout distinguished: abort is not retried, timeout is

## Logging

**Framework:** `console.error()` to stderr only (critical for stdio MCP transport)

**Logger Creation:**
- Use `createLogger(module: string): Logger` to create loggers
- Modules are simple strings like `"main"`, `"harness-client"`, `"list"`
- Global log level set once: `setLogLevel(config.LOG_LEVEL)`

**Logging Pattern:**
```typescript
const log = createLogger("module-name");
log.info("Message", { key: value, error: String(err) });
log.warn("Warning message", { context: "data" });
log.error("Error", { statusCode: 401, correlationId: "abc" });
log.debug("Debug details"); // Only logged when LOG_LEVEL=debug
```

**Log Levels:** `debug`, `info`, `warn`, `error` (ordered by severity)

**Special Logging:**
- Audit logging: `logAudit(entry)` for operations that modify resources
- Audit entry shape: `{ operation, resource_type, resource_id?, org_id?, project_id?, outcome: "success" | "error", error? }`

**Stderr-only Rule (CRITICAL):**
- NEVER write to `console.log()` — breaks JSON-RPC in stdio transport
- Always use `console.error()` or logger for output
- JSON-formatted log entries enable parsing by monitoring systems

## Comments

**When to Comment:**
- Comments explain WHY, not WHAT (code shows the WHAT)
- Block comments for major sections, algorithm explanations
- Inline comments for non-obvious logic, workarounds, important edge cases
- Avoid over-commenting obvious code

**JSDoc/TSDoc:**
- Function exports have JSDoc blocks
- Example from `src/config.ts`:
  ```typescript
  /**
   * Extract the account ID from a Harness PAT token.
   * PAT format: pat.<accountId>.<tokenId>.<secret>
   * Returns undefined if the token doesn't match the expected format.
   */
  export function extractAccountIdFromToken(apiKey: string): string | undefined
  ```
- Tool descriptions use Zod `.describe()` for parameter documentation (visible to LLMs)
- Public APIs documented, internal helpers may be lighter

## Function Design

**Size:** Functions are focused and lean
- Tool handler functions: 30-50 lines (main flow, error handling, result formatting)
- Utility functions: 5-20 lines (single responsibility)
- Complex logic delegated to helper functions or classes

**Parameters:**
- Minimal parameters preferred
- Use destructuring for options objects
- Type all parameters (no implicit `any`)
- Optional params use `?:` syntax and Zod `.optional()`

**Return Values:**
- Async functions return typed Promises
- Tool handlers return `ToolResult` (text, image, or mixed)
- Registry methods return structured objects (not raw API responses)
- Client methods return generic `<T>` to support various response shapes

**Naming:** Verbs describe action
- `register{Type}Tool()` — registers a tool
- `dispatch()` — routes a request
- `request<T>()` — makes HTTP request
- `format()` — transforms data

## Module Design

**Exports:**
- Each module exports only what's necessary
- Tool files export `register{Type}Tool(server, registry, client)` function
- Clients export class instances and type definitions
- Utilities export helper functions and types
- Pattern: `export function register...` or `export class ...` or `export type ...`

**Barrel Files:**
- `src/tools/index.ts` imports and calls all `registerXxxTool()` functions
- `src/resources/index.ts` does same for resources
- `src/prompts/index.ts` does same for prompts
- Prevents tree-shaking issues and centralizes tool registration

**Dependency Injection:**
- Tools receive `(server, registry, client)` parameters
- Client is passed to all tools, avoiding global singletons
- Config passed to tools that need it (e.g., auth features)
- Registry holds all resource type handlers

**No Global State:**
- Logger module has module-level `globalLevel` but it's set once at startup
- Session store in `src/index.ts` is function-local to `startHttp()`
- Each request gets fresh context

---

*Convention analysis: 2026-03-19*
