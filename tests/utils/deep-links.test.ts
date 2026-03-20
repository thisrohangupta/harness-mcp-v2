import { describe, it, expect } from "vitest";
import { buildDeepLink } from "../../src/utils/deep-links.js";

describe("buildDeepLink", () => {
  const baseUrl = "https://app.harness.io";
  const accountId = "abc123";

  it("substitutes accountId and params", () => {
    const url = buildDeepLink(
      baseUrl,
      accountId,
      "/ng/account/{accountId}/orgs/{orgIdentifier}/projects/{projectIdentifier}",
      { orgIdentifier: "default", projectIdentifier: "myProject" },
    );
    expect(url).toBe(
      "https://app.harness.io/ng/account/abc123/orgs/default/projects/myProject",
    );
  });

  it("URL-encodes special characters in param values", () => {
    const url = buildDeepLink(
      baseUrl,
      accountId,
      "/ng/account/{accountId}/pipelines/{pipelineId}",
      { pipelineId: "my pipeline/test" },
    );
    expect(url).toBe(
      "https://app.harness.io/ng/account/abc123/pipelines/my%20pipeline%2Ftest",
    );
  });

  it("strips trailing slash from base URL", () => {
    const url = buildDeepLink(
      "https://app.harness.io/",
      accountId,
      "/ng/account/{accountId}",
      {},
    );
    expect(url).toBe("https://app.harness.io/ng/account/abc123");
  });

  it("handles empty params", () => {
    const url = buildDeepLink(baseUrl, accountId, "/ng/account/{accountId}/home", {});
    expect(url).toBe("https://app.harness.io/ng/account/abc123/home");
  });
});
