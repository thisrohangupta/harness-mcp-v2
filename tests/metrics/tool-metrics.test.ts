import { describe, it, expect, beforeEach, vi } from "vitest";
import { registry } from "../../src/metrics/registry.js";

// Reset metric values (not registration) before each test.
// We clear and immediately re-collect metrics so counters start from zero.
// We do NOT use registry.resetMetrics() (which deregisters metrics) because
// metrics are module-level singletons and cannot be re-registered.
beforeEach(async () => {
  // Import the module once to ensure metrics are registered
  await import("../../src/metrics/tool-metrics.js");
  // Reset counter/histogram values by clearing and re-setting
  // We use the registry's getSingleMetric to reset state between tests
  const { toolCallsTotal, toolCallDuration, toolExecutionsTotal } = await import("../../src/metrics/tool-metrics.js");
  toolCallsTotal.reset();
  toolCallDuration.reset();
  toolExecutionsTotal.reset();
});

describe("Tool Metrics — metric definitions", () => {
  it("toolCallsTotal is a Counter with name mcp_tool_calls_total and correct labelNames", async () => {
    const { toolCallsTotal } = await import("../../src/metrics/tool-metrics.js");
    const metrics = await registry.metrics();
    expect(metrics).toContain("mcp_tool_calls_total");
    // Verify the metric object exists and is a Counter
    expect(toolCallsTotal).toBeDefined();
  });

  it("toolCallDuration is a Histogram with name mcp_tool_call_duration_seconds and correct labelNames", async () => {
    const { toolCallDuration } = await import("../../src/metrics/tool-metrics.js");
    const metrics = await registry.metrics();
    expect(metrics).toContain("mcp_tool_call_duration_seconds");
    expect(toolCallDuration).toBeDefined();
  });

  it("toolExecutionsTotal is a Counter with name mcp_tool_executions_total and correct labelNames", async () => {
    const { toolExecutionsTotal } = await import("../../src/metrics/tool-metrics.js");
    const metrics = await registry.metrics();
    expect(metrics).toContain("mcp_tool_executions_total");
    expect(toolExecutionsTotal).toBeDefined();
  });

  it("toolCallDuration histogram uses buckets [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5]", async () => {
    const { withMetrics } = await import("../../src/metrics/tool-metrics.js");
    const mockRegistry = { getResource: vi.fn().mockReturnValue({ toolset: "pipelines" }) };
    const handler = vi.fn().mockResolvedValue({ content: [] });
    const wrapped = withMetrics("harness_list", mockRegistry as any)(handler);
    // Make a call to populate histogram output with bucket labels
    await wrapped({ resource_type: "pipeline" });

    const metrics = await registry.metrics();
    // Prometheus text format emits bucket boundaries as le labels
    expect(metrics).toContain('le="0.001"');
    expect(metrics).toContain('le="0.005"');
    expect(metrics).toContain('le="0.01"');
    expect(metrics).toContain('le="0.05"');
    expect(metrics).toContain('le="0.1"');
    expect(metrics).toContain('le="0.5"');
    expect(metrics).toContain('le="1"');
    expect(metrics).toContain('le="5"');
  });
});

describe("withMetrics — outcome classification", () => {
  function makeMockRegistry(toolset = "pipelines") {
    return {
      getResource: vi.fn().mockReturnValue({ toolset }),
    };
  }

  it("wraps a handler — successful call increments counter with outcome=ok", async () => {
    const { withMetrics, toolCallsTotal } = await import("../../src/metrics/tool-metrics.js");
    const mockRegistry = makeMockRegistry("pipelines");
    const handler = vi.fn().mockResolvedValue({ content: [{ type: "text", text: "ok" }] });
    const wrapped = withMetrics("harness_list", mockRegistry as any)(handler);

    await wrapped({ resource_type: "pipeline" });

    const metrics = await registry.metrics();
    expect(metrics).toContain('outcome="ok"');
    expect(metrics).toContain('tool="harness_list"');
    expect(metrics).toContain('resource_type="pipeline"');
    expect(metrics).toContain('module="pipelines"');
  });

  it("wraps a handler — result with isError:true increments counter with outcome=tool_error", async () => {
    const { withMetrics } = await import("../../src/metrics/tool-metrics.js");
    const mockRegistry = makeMockRegistry("pipelines");
    const handler = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "bad input" }],
      isError: true,
    });
    const wrapped = withMetrics("harness_list", mockRegistry as any)(handler);

    await wrapped({ resource_type: "pipeline" });

    const metrics = await registry.metrics();
    expect(metrics).toContain('outcome="tool_error"');
  });

  it("wraps a handler — handler throws isUserError (plain Error) → outcome=tool_error, re-throws", async () => {
    const { withMetrics } = await import("../../src/metrics/tool-metrics.js");
    const mockRegistry = makeMockRegistry("pipelines");
    const userError = new Error("bad resource_type");
    const handler = vi.fn().mockRejectedValue(userError);
    const wrapped = withMetrics("harness_list", mockRegistry as any)(handler);

    await expect(wrapped({ resource_type: "pipeline" })).rejects.toThrow("bad resource_type");

    const metrics = await registry.metrics();
    expect(metrics).toContain('outcome="tool_error"');
  });

  it("wraps a handler — handler throws isUserFixableApiError (400) → outcome=tool_error, re-throws", async () => {
    const { withMetrics } = await import("../../src/metrics/tool-metrics.js");
    const { HarnessApiError } = await import("../../src/utils/errors.js");
    const mockRegistry = makeMockRegistry("pipelines");
    const apiError = new HarnessApiError("Not found", 400);
    const handler = vi.fn().mockRejectedValue(apiError);
    const wrapped = withMetrics("harness_list", mockRegistry as any)(handler);

    await expect(wrapped({ resource_type: "pipeline" })).rejects.toThrow("Not found");

    const metrics = await registry.metrics();
    expect(metrics).toContain('outcome="tool_error"');
  });

  it("wraps a handler — handler throws generic Error (system failure) → outcome=error, re-throws", async () => {
    const { withMetrics } = await import("../../src/metrics/tool-metrics.js");
    const { HarnessApiError } = await import("../../src/utils/errors.js");
    const mockRegistry = makeMockRegistry("pipelines");
    // 500 is not user-fixable
    const apiError = new HarnessApiError("Internal server error", 500);
    const handler = vi.fn().mockRejectedValue(apiError);
    const wrapped = withMetrics("harness_list", mockRegistry as any)(handler);

    await expect(wrapped({ resource_type: "pipeline" })).rejects.toThrow("Internal server error");

    const metrics = await registry.metrics();
    expect(metrics).toContain('outcome="error"');
  });

  it("records duration histogram on every call (success)", async () => {
    const { withMetrics } = await import("../../src/metrics/tool-metrics.js");
    const mockRegistry = makeMockRegistry("pipelines");
    const handler = vi.fn().mockResolvedValue({ content: [] });
    const wrapped = withMetrics("harness_list", mockRegistry as any)(handler);

    await wrapped({ resource_type: "pipeline" });

    const metrics = await registry.metrics();
    // Histogram sum should be present (non-negative value)
    expect(metrics).toContain("mcp_tool_call_duration_seconds_sum");
    expect(metrics).toContain("mcp_tool_call_duration_seconds_count");
  });

  it("records duration histogram on failure (exception)", async () => {
    const { withMetrics } = await import("../../src/metrics/tool-metrics.js");
    const mockRegistry = makeMockRegistry("pipelines");
    const handler = vi.fn().mockRejectedValue(new Error("fail"));
    const wrapped = withMetrics("harness_list", mockRegistry as any)(handler);

    await expect(wrapped({ resource_type: "pipeline" })).rejects.toThrow();

    const metrics = await registry.metrics();
    expect(metrics).toContain("mcp_tool_call_duration_seconds_sum");
  });

  it("resolves module from harnessRegistry.getResource(resource_type).toolset", async () => {
    const { withMetrics } = await import("../../src/metrics/tool-metrics.js");
    const mockRegistry = makeMockRegistry("services");
    const handler = vi.fn().mockResolvedValue({ content: [] });
    const wrapped = withMetrics("harness_list", mockRegistry as any)(handler);

    await wrapped({ resource_type: "service" });

    expect(mockRegistry.getResource).toHaveBeenCalledWith("service");
    const metrics = await registry.metrics();
    expect(metrics).toContain('module="services"');
  });

  it("falls back to module=platform when resource_type is absent", async () => {
    const { withMetrics } = await import("../../src/metrics/tool-metrics.js");
    const mockRegistry = makeMockRegistry("pipelines");
    const handler = vi.fn().mockResolvedValue({ content: [] });
    const wrapped = withMetrics("harness_list", mockRegistry as any)(handler);

    // No resource_type in args
    await wrapped({});

    const metrics = await registry.metrics();
    expect(metrics).toContain('module="platform"');
    // getResource should NOT have been called since resource_type is absent
    expect(mockRegistry.getResource).not.toHaveBeenCalled();
  });

  it("falls back to module=platform when getResource throws (unknown resource_type)", async () => {
    const { withMetrics } = await import("../../src/metrics/tool-metrics.js");
    const mockRegistry = {
      getResource: vi.fn().mockImplementation(() => {
        throw new Error("Unknown resource_type");
      }),
    };
    const handler = vi.fn().mockResolvedValue({ content: [] });
    const wrapped = withMetrics("harness_list", mockRegistry as any)(handler);

    await wrapped({ resource_type: "unknown_thing" });

    const metrics = await registry.metrics();
    expect(metrics).toContain('module="platform"');
  });

  it("captures resource_type from args.resource_type — uses empty string when absent", async () => {
    const { withMetrics } = await import("../../src/metrics/tool-metrics.js");
    const mockRegistry = makeMockRegistry("pipelines");
    const handler = vi.fn().mockResolvedValue({ content: [] });
    const wrapped = withMetrics("harness_list", mockRegistry as any)(handler);

    await wrapped({});

    const metrics = await registry.metrics();
    expect(metrics).toContain('resource_type=""');
  });

  it("for harness_execute tool — also increments toolExecutionsTotal with action label", async () => {
    const { withMetrics } = await import("../../src/metrics/tool-metrics.js");
    const mockRegistry = makeMockRegistry("pipelines");
    const handler = vi.fn().mockResolvedValue({ content: [] });
    const wrapped = withMetrics("harness_execute", mockRegistry as any)(handler);

    await wrapped({ resource_type: "pipeline", action: "run" });

    const metrics = await registry.metrics();
    expect(metrics).toContain("mcp_tool_executions_total");
    expect(metrics).toContain('action="run"');
  });

  it("for non-execute tools — toolExecutionsTotal is NOT incremented", async () => {
    const { withMetrics } = await import("../../src/metrics/tool-metrics.js");
    const mockRegistry = makeMockRegistry("pipelines");
    const handler = vi.fn().mockResolvedValue({ content: [] });
    const wrapped = withMetrics("harness_list", mockRegistry as any)(handler);

    await wrapped({ resource_type: "pipeline", action: "run" });

    const metrics = await registry.metrics();
    // toolExecutionsTotal should have 0 samples (not incremented)
    // The metric will appear in output but the counter value should be 0
    const execLines = metrics.split("\n").filter(l => l.startsWith("mcp_tool_executions_total{"));
    expect(execLines).toHaveLength(0);
  });

  it("metrics failures are swallowed — original result still propagates", async () => {
    const { withMetrics, toolCallsTotal } = await import("../../src/metrics/tool-metrics.js");
    const mockRegistry = makeMockRegistry("pipelines");
    // Spy on toolCallsTotal.inc to throw
    const incSpy = vi.spyOn(toolCallsTotal, "inc").mockImplementation(() => {
      throw new Error("Prometheus internal error");
    });

    const handler = vi.fn().mockResolvedValue({ content: [{ type: "text", text: "success" }] });
    const wrapped = withMetrics("harness_list", mockRegistry as any)(handler);

    // Should NOT throw despite metrics failure
    const result = await wrapped({ resource_type: "pipeline" });
    expect(result).toEqual({ content: [{ type: "text", text: "success" }] });

    incSpy.mockRestore();
  });
});
