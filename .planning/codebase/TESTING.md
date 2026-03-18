# Testing Patterns

**Analysis Date:** 2026-03-19

## Test Framework

**Runner:**
- Vitest 3.0.6+
- Config: `vitest.config.ts`
- Environment: node

**Configuration:**
```typescript
// vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
```

**Assertion Library:**
- Vitest built-in `expect()` and matchers
- Direct use without additional libraries

**Run Commands:**
```bash
pnpm test              # Run all tests once
pnpm test:watch        # Run tests in watch mode
pnpm typecheck         # Type check (tsc --noEmit)
```

## Test File Organization

**Location:**
- Co-located with source in `tests/` directory (mirror structure)
- Source: `src/config.ts` → Test: `tests/config.test.ts`
- Source: `src/client/harness-client.ts` → Test: `tests/client/harness-client.test.ts`
- Source: `src/tools/harness-ask.ts` → Test: `tests/tools/harness-ask.test.ts`

**Naming:**
- `.test.ts` suffix for all test files
- Mirror directory structure of `src/` in `tests/`
- Example test hierarchy:
  ```
  tests/
  ├── config.test.ts
  ├── client/
  │   ├── harness-client.test.ts
  │   └── intelligence-client.test.ts
  ├── tools/
  │   ├── harness-ask.test.ts
  │   ├── tool-handlers.test.ts
  │   └── diagnose/
  │       ├── pipeline.test.ts
  │       └── router.test.ts
  ├── utils/
  │   ├── errors.test.ts
  │   ├── logger.test.ts
  │   └── rate-limiter.test.ts
  ├── registry/
  │   └── registry.test.ts
  └── integration/
      └── http-transport.test.ts
  ```

## Test Structure

**Suite Organization:**
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("HarnessClient", () => {
  describe("constructor and account getter", () => {
    it("exposes account ID", () => {
      // test body
    });
  });

  describe("request — URL building", () => {
    it("builds URL with accountIdentifier and custom params", async () => {
      // test body
    });
  });
});
```

**Patterns:**
- Use `describe()` for test suites, nested for sub-suites
- Use `it()` for individual tests
- Each test has a clear, descriptive title
- Multiple related tests grouped under same `describe()` block

**Setup/Teardown:**
```typescript
describe("HarnessClient", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("tests using the spy", () => {
    expect(fetchSpy).toHaveBeenCalled();
  });
});
```

- `beforeEach()` runs before each test in the suite
- `afterEach()` cleans up after each test
- Always restore mocks: `vi.restoreAllMocks()`

## Mocking

**Framework:** Vitest's `vi` module (built-in)

**Patterns:**

**Spy/Mock a function:**
```typescript
const fetchSpy = vi.spyOn(globalThis, "fetch");
fetchSpy.mockResolvedValue(new Response(JSON.stringify({ data: "ok" }), { status: 200 }));

// Use normally, then assert:
expect(fetchSpy).toHaveBeenCalled();
expect(fetchSpy.mock.calls[0][0]).toBe("expected-url");
expect(fetchSpy).toHaveBeenCalledWith(...);
```

**Mock a class method:**
```typescript
vi.spyOn(HarnessClient.prototype, "request").mockResolvedValue({ data: "mock" });
```

**Create a mock object:**
```typescript
const mockClient: HarnessClient = {
  request: vi.fn().mockResolvedValue({}),
  requestStream: vi.fn(),
  account: "test-account",
} as unknown as HarnessClient;
```

**Mock environment variables (from config.test.ts):**
```typescript
function withEnv(env: Record<string, string>, fn: () => void) {
  const prev = { ...process.env };
  // Clear all env vars
  for (const key of Object.keys(process.env)) {
    delete process.env[key];
  }
  Object.assign(process.env, env);
  try {
    fn();
  } finally {
    // Restore
    for (const key of Object.keys(process.env)) {
      delete process.env[key];
    }
    Object.assign(process.env, prev);
  }
}

it("uses explicit HARNESS_ACCOUNT_ID when provided", () => {
  withEnv(
    { HARNESS_API_KEY: "pat.fromtoken.tok.sec", HARNESS_ACCOUNT_ID: "explicit" },
    () => {
      const config = loadConfig();
      expect(config.HARNESS_ACCOUNT_ID).toBe("explicit");
    },
  );
});
```

**What to Mock:**
- External HTTP calls (fetch)
- File system operations
- Environment variables for different test scenarios
- Time-dependent operations (Date.now())
- Expensive operations (actual API calls)

**What NOT to Mock:**
- Pure functions (test with real inputs/outputs)
- Core business logic (test the actual algorithm)
- Type validation (test Zod schemas with real values)
- Error handling flow (test actual error paths)

## Fixtures and Factories

**Test Data Helpers:**
```typescript
// From harness-client.test.ts
function makeConfig(overrides: Partial<Config> = {}): Config {
  return {
    HARNESS_API_KEY: "pat.test-account.token.secret",
    HARNESS_ACCOUNT_ID: "test-account",
    HARNESS_BASE_URL: "https://app.harness.io",
    HARNESS_DEFAULT_ORG_ID: "default",
    HARNESS_DEFAULT_PROJECT_ID: "test-project",
    HARNESS_API_TIMEOUT_MS: 5000,
    HARNESS_MAX_RETRIES: 2,
    LOG_LEVEL: "error",
    HARNESS_RATE_LIMIT_RPS: 1000,
    HARNESS_MAX_BODY_SIZE_MB: 10,
    HARNESS_READ_ONLY: false,
    ...overrides,
  };
}

// From harness-ask.test.ts
function makeClient(requestFn?: (...args: unknown[]) => unknown): HarnessClient {
  return {
    request: requestFn ?? vi.fn().mockResolvedValue({}),
    requestStream: vi.fn(),
    account: "test-account",
  } as unknown as HarnessClient;
}

function makeMcpServer() {
  const tools = new Map<string, { schema: unknown; handler: (...args: unknown[]) => Promise<ToolResult> }>();
  return {
    registerTool: vi.fn((name: string, schema: unknown, handler) => {
      tools.set(name, { schema, handler });
    }),
    _tools: tools,
    async call(name: string, args: Record<string, unknown>) {
      const tool = tools.get(name);
      if (!tool) throw new Error(`Tool "${name}" not registered`);
      return tool.handler(args) as Promise<ToolResult>;
    },
  } as any;
}
```

**Location:**
- In the test file itself, near top
- Organized by what they create: `makeConfig()`, `makeClient()`, `makeMcpServer()`
- Accept `overrides` or optional parameters for test-specific customization

## Coverage

**Requirements:**
- Not formally enforced in CI (no minimum threshold configured)
- Tests exist for critical paths (config, client, tools)
- Integration tests verify end-to-end flows

**View Coverage:**
```bash
# Manual verification by running tests
pnpm test

# No coverage tool configured (e.g., no c8, no coverage reporter)
```

## Test Types

**Unit Tests:**
- Scope: Single function or class method
- Location: `tests/client/*.test.ts`, `tests/utils/*.test.ts`
- Approach: Mock external dependencies, test in isolation
- Example: `tests/config.test.ts` tests `ConfigSchema.safeParse()` with various inputs
- Example: `tests/client/harness-client.test.ts` tests URL building, retries, error handling

**Integration Tests:**
- Scope: Multiple components working together
- Location: `tests/integration/*.test.ts`, `tests/tools/tool-handlers.test.ts`
- Approach: Mock HTTP layer, test full tool flow
- Example: Tool handler receives input → dispatches to registry → formats output
- Example: HTTP transport session management with MCP SDK

**E2E Tests:**
- Framework: Not used (manual testing via `npm run inspect`)
- Instead: Use `npx @modelcontextprotocol/inspector node build/index.js stdio`
- Can test actual tool calls against mock Harness API

## Common Patterns

**Async Testing:**
```typescript
it("retrieves a pipeline", async () => {
  fetchSpy.mockResolvedValue(new Response(JSON.stringify({ data: { id: "p1" } }), { status: 200 }));
  const client = new HarnessClient(makeConfig());

  const result = await client.request({ path: "/pipeline/api/pipelines/p1" });

  expect(result).toEqual({ data: { id: "p1" } });
});
```

- Mark test with `async`
- Use `await` for async operations
- Assertions after async operations complete

**Error Testing:**
```typescript
// From harness-client.test.ts
it("retries on 500 errors up to maxRetries", async () => {
  let attempts = 0;
  fetchSpy.mockImplementation(() => {
    attempts++;
    if (attempts < 3) {
      return Promise.resolve(new Response("", { status: 500 }));
    }
    return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
  });

  const client = new HarnessClient(makeConfig({ HARNESS_MAX_RETRIES: 3 }));
  const result = await client.request({ path: "/test" });

  expect(result).toEqual({ ok: true });
  expect(attempts).toBe(3);
});

// Testing thrown errors
it("throws HarnessApiError on 401", async () => {
  fetchSpy.mockResolvedValue(new Response(JSON.stringify({ message: "Unauthorized" }), { status: 401 }));
  const client = new HarnessClient(makeConfig());

  await expect(
    client.request({ path: "/test" })
  ).rejects.toThrow(HarnessApiError);
});
```

- Test success path first
- Test error conditions: non-retriable errors, max retries exceeded, connection errors
- Use `.rejects` for promises that should throw
- Verify error type and message

**Zod Schema Testing:**
```typescript
// From config.test.ts
it("parses valid full config", () => {
  const result = ConfigSchema.safeParse({
    HARNESS_API_KEY: "pat.acct123.tokenId.secret",
    HARNESS_ACCOUNT_ID: "acct123",
    HARNESS_BASE_URL: "https://custom.harness.io",
  });
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.data.HARNESS_BASE_URL).toBe("https://custom.harness.io");
  }
});

it("fails when both HARNESS_API_KEY and JWT_SECRET are missing", () => {
  const result = ConfigSchema.safeParse({ HARNESS_ACCOUNT_ID: "acct123" });
  expect(result.success).toBe(false);
  if (!result.success) {
    expect(result.error.issues[0].message).toContain("Either JWT_SECRET");
  }
});
```

- Always use `.safeParse()` (returns `{ success, data, error }`)
- Check `.success` flag first
- Use type guard `if (result.success)` to narrow type
- Test both valid and invalid inputs
- Verify error messages for invalid cases

**Spy/Call Assertion:**
```typescript
// Verify fetch was called with right URL
expect(fetchSpy).toHaveBeenCalledWith(
  expect.stringContaining("https://app.harness.io/ng/api/projects"),
  expect.any(Object)
);

// Extract call arguments
const url = new URL(fetchSpy.mock.calls[0][0] as string);
expect(url.searchParams.get("accountIdentifier")).toBe("test-account");

// Check call count
expect(fetchSpy).toHaveBeenCalledTimes(1);
```

---

*Testing analysis: 2026-03-19*
