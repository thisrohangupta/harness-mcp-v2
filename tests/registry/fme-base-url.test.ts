import { describe, it, expect, vi, beforeEach } from "vitest";
import { Registry } from "../../src/registry/index.js";
import type { Config } from "../../src/config.js";
import type { HarnessClient } from "../../src/client/harness-client.js";

function makeConfig(overrides: Partial<Config> = {}): Config {
  return {
    HARNESS_API_KEY: "pat.test-account.token.secret",
    HARNESS_ACCOUNT_ID: "test-account",
    HARNESS_BASE_URL: "https://app.harness.io",
    HARNESS_DEFAULT_ORG_ID: "default",
    HARNESS_DEFAULT_PROJECT_ID: "test-project",
    HARNESS_API_TIMEOUT_MS: 30000,
    HARNESS_MAX_RETRIES: 3,
    LOG_LEVEL: "error",
    HARNESS_RATE_LIMIT_RPS: 1000,
    HARNESS_MAX_BODY_SIZE_MB: 10,
    HARNESS_READ_ONLY: false,
    HARNESS_FME_BASE_URL: "https://api.split.io",
    ...overrides,
  };
}

function makeClient(requestFn?: (...args: unknown[]) => unknown): HarnessClient {
  return {
    request: requestFn ?? vi.fn().mockResolvedValue({}),
    account: "test-account",
  } as unknown as HarnessClient;
}

describe("FME base URL routing", () => {
  describe("fme_feature_flag uses Split.io base URL", () => {
    let registry: Registry;
    beforeEach(() => {
      registry = new Registry(makeConfig({ HARNESS_TOOLSETS: "feature-flags" }));
    });

    it("passes baseUrl override for fme_feature_flag list", async () => {
      const mockRequest = vi.fn().mockResolvedValue({ objects: [] });
      const client = makeClient(mockRequest);

      await registry.dispatch(client, "fme_feature_flag", "list", {
        workspace_id: "ws-123",
      });

      const call = mockRequest.mock.calls[0][0];
      expect(call.baseUrl).toBe("https://api.split.io");
      expect(call.path).toBe("/internal/api/v2/splits/ws/ws-123");
    });

    it("passes baseUrl override for fme_feature_flag get", async () => {
      const mockRequest = vi.fn().mockResolvedValue({ name: "my-flag" });
      const client = makeClient(mockRequest);

      await registry.dispatch(client, "fme_feature_flag", "get", {
        workspace_id: "ws-123",
        feature_flag_name: "my-flag",
      });

      const call = mockRequest.mock.calls[0][0];
      expect(call.baseUrl).toBe("https://api.split.io");
      expect(call.path).toBe("/internal/api/v2/splits/ws/ws-123/my-flag");
    });
  });

  describe("fme_workspace uses Split.io base URL", () => {
    it("passes baseUrl override for fme_workspace list", async () => {
      const registry = new Registry(makeConfig({ HARNESS_TOOLSETS: "feature-flags" }));
      const mockRequest = vi.fn().mockResolvedValue({ objects: [] });
      const client = makeClient(mockRequest);

      await registry.dispatch(client, "fme_workspace", "list", {});

      const call = mockRequest.mock.calls[0][0];
      expect(call.baseUrl).toBe("https://api.split.io");
      expect(call.path).toBe("/cf/admin/workspaces");
    });
  });

  describe("fme_environment uses Split.io base URL", () => {
    it("passes baseUrl override for fme_environment list", async () => {
      const registry = new Registry(makeConfig({ HARNESS_TOOLSETS: "feature-flags" }));
      const mockRequest = vi.fn().mockResolvedValue({ objects: [] });
      const client = makeClient(mockRequest);

      await registry.dispatch(client, "fme_environment", "list", {});

      const call = mockRequest.mock.calls[0][0];
      expect(call.baseUrl).toBe("https://api.split.io");
      expect(call.path).toBe("/cf/admin/environments");
    });
  });

  describe("non-FME resources do not get baseUrl override", () => {
    it("feature_flag (Harness CF) does not get baseUrl", async () => {
      const registry = new Registry(makeConfig({ HARNESS_TOOLSETS: "feature-flags" }));
      const mockRequest = vi.fn().mockResolvedValue({ features: [] });
      const client = makeClient(mockRequest);

      await registry.dispatch(client, "feature_flag", "list", {});

      const call = mockRequest.mock.calls[0][0];
      expect(call.baseUrl).toBeUndefined();
    });
  });

  describe("HARNESS_FME_BASE_URL env var override", () => {
    it("uses custom FME base URL from config", async () => {
      const registry = new Registry(makeConfig({
        HARNESS_TOOLSETS: "feature-flags",
        HARNESS_FME_BASE_URL: "https://custom-split.example.com",
      }));
      const mockRequest = vi.fn().mockResolvedValue({ objects: [] });
      const client = makeClient(mockRequest);

      await registry.dispatch(client, "fme_feature_flag", "list", {
        workspace_id: "ws-456",
      });

      const call = mockRequest.mock.calls[0][0];
      expect(call.baseUrl).toBe("https://custom-split.example.com");
    });
  });
});
