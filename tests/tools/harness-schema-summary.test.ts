import { describe, it, expect } from "vitest";
import agentPipeline from "../../src/data/schemas/agent-pipeline.js";
import { getHarnessSchemaSummary } from "../../src/tools/harness-schema.js";

describe("getHarnessSchemaSummary", () => {
  it("returns oneOf variants for agent-pipeline (not empty fields)", () => {
    const summary = getHarnessSchemaSummary(
      agentPipeline as Record<string, unknown>,
      "agent-pipeline",
    ) as Record<string, unknown>;

    expect(summary.summary_kind).toBe("oneOf_root");
    const variants = summary.variants as Array<{ required: string[] }>;
    expect(Array.isArray(variants)).toBe(true);
    expect(variants.length).toBeGreaterThanOrEqual(2);
    const hasAgentBranch = variants.some((v) => v.required?.includes("agent"));
    const hasTemplateBranch = variants.some((v) => v.required?.includes("template"));
    expect(hasAgentBranch).toBe(true);
    expect(hasTemplateBranch).toBe(true);
    expect(Array.isArray(summary.available_sections)).toBe(true);
    expect((summary.available_sections as string[]).length).toBeGreaterThan(0);
  });
});
