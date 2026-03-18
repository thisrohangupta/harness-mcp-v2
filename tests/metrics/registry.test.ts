import { describe, it, expect, beforeEach } from "vitest";
import { registry, buildInfo } from "../../src/metrics/registry.js";
import { register } from "prom-client";

describe("Metrics Registry", () => {
  beforeEach(async () => {
    // Import fresh registry instance for each test
    // Note: registry.clear() removes all metrics, including buildInfo
    // We don't clear in beforeEach to preserve the buildInfo gauge registration
  });

  it("registry is an instance of prom-client Registry (not the global defaultRegister)", () => {
    // registry should NOT be the same object as the global register
    expect(registry).not.toBe(register);
    // registry should be a Registry instance
    expect(registry.constructor.name).toBe("Registry");
  });

  it("await registry.metrics() output contains mcp_build_info metric name", async () => {
    const metrics = await registry.metrics();
    expect(metrics).toContain("mcp_build_info");
  });

  it("await registry.metrics() output contains node_version label with current process.version", async () => {
    const metrics = await registry.metrics();
    expect(metrics).toContain(`node_version="${process.version}"`);
  });

  it("await registry.metrics() output contains version label", async () => {
    const metrics = await registry.metrics();
    // Should have version label (value can be "unknown" or actual version)
    expect(metrics).toMatch(/version="[^"]+"/);
  });

  it("mcp_build_info gauge value is 1", async () => {
    const metrics = await registry.metrics();
    // The metric line should end with " 1" (the gauge value)
    expect(metrics).toMatch(/mcp_build_info\{[^}]+\} 1/);
  });

  it("registry.clear() resets all metrics (empty after clear)", () => {
    // Clear registry
    registry.clear();
    // After clearing, getSingleMetric should return undefined
    const metric = registry.getSingleMetric("mcp_build_info");
    expect(metric).toBeUndefined();
  });
});
