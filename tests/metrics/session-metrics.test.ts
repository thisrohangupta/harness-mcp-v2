import { describe, it, expect, beforeEach } from "vitest";
import { registry } from "../../src/metrics/registry.js";

// Reset gauge value before each test to ensure isolation.
// We do NOT use registry.resetMetrics() because metrics are module-level singletons
// and cannot be re-registered once deregistered.
beforeEach(async () => {
  // Import the module once to ensure gauge is registered
  await import("../../src/metrics/session-metrics.js");
  // Reset the gauge value to 0 between tests
  const metric = registry.getSingleMetric("mcp_active_sessions");
  if (metric) {
    metric.reset();
  }
});

describe("Session Metrics — metric definition", () => {
  it("mcp_active_sessions gauge is registered on the custom registry", async () => {
    const metric = registry.getSingleMetric("mcp_active_sessions");
    expect(metric).toBeDefined();
  });

  it("registry.metrics() output contains 'mcp_active_sessions'", async () => {
    const output = await registry.metrics();
    expect(output).toContain("mcp_active_sessions");
  });
});

describe("sessionConnected — increments gauge", () => {
  it("sessionConnected() increments the gauge by 1", async () => {
    const { sessionConnected } = await import("../../src/metrics/session-metrics.js");
    sessionConnected();
    const output = await registry.metrics();
    expect(output).toContain("mcp_active_sessions 1");
  });

  it("calling sessionConnected() three times results in gauge value 3", async () => {
    const { sessionConnected } = await import("../../src/metrics/session-metrics.js");
    sessionConnected();
    sessionConnected();
    sessionConnected();
    const output = await registry.metrics();
    expect(output).toContain("mcp_active_sessions 3");
  });
});

describe("sessionDisconnected — decrements gauge", () => {
  it("sessionDisconnected() decrements the gauge by 1", async () => {
    const { sessionConnected, sessionDisconnected } = await import("../../src/metrics/session-metrics.js");
    sessionConnected();
    sessionConnected();
    sessionDisconnected();
    const output = await registry.metrics();
    expect(output).toContain("mcp_active_sessions 1");
  });

  it("3 connects followed by 1 disconnect results in gauge value 2", async () => {
    const { sessionConnected, sessionDisconnected } = await import("../../src/metrics/session-metrics.js");
    sessionConnected();
    sessionConnected();
    sessionConnected();
    sessionDisconnected();
    const output = await registry.metrics();
    expect(output).toContain("mcp_active_sessions 2");
  });

  it("sequential connect/disconnect pairs track correctly — net result is 0", async () => {
    const { sessionConnected, sessionDisconnected } = await import("../../src/metrics/session-metrics.js");
    sessionConnected();
    sessionDisconnected();
    sessionConnected();
    sessionDisconnected();
    const output = await registry.metrics();
    expect(output).toContain("mcp_active_sessions 0");
  });
});
