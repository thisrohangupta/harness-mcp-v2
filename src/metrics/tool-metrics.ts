import { Counter, Histogram } from "prom-client";
import { registry } from "./registry.js";
import { createLogger } from "../utils/logger.js";
import { isUserError, isUserFixableApiError } from "../utils/errors.js";
import type { Registry as HarnessRegistry } from "../registry/index.js";

const log = createLogger("tool-metrics");

/**
 * Type for a tool handler function — matches the MCP tool handler signature.
 */
export type ToolHandler = (args: Record<string, unknown>) => Promise<{
  content: unknown[];
  isError?: boolean;
  [key: string]: unknown;
}>;

/**
 * Counter for total MCP tool calls, labelled by tool, resource_type, module, outcome.
 */
export const toolCallsTotal = new Counter({
  name: "mcp_tool_calls_total",
  help: "Total number of MCP tool calls",
  labelNames: ["tool", "resource_type", "module", "outcome"] as const,
  registers: [registry],
});

/**
 * Histogram for MCP tool call duration in seconds.
 * Labelled by tool, resource_type, module.
 */
export const toolCallDuration = new Histogram({
  name: "mcp_tool_call_duration_seconds",
  help: "Duration of MCP tool calls in seconds",
  labelNames: ["tool", "resource_type", "module"] as const,
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5],
  registers: [registry],
});

/**
 * Counter for execute actions — only incremented for harness_execute tool calls.
 * Labelled by tool, resource_type, module, outcome, action.
 */
export const toolExecutionsTotal = new Counter({
  name: "mcp_tool_executions_total",
  help: "Total number of MCP tool execute actions",
  labelNames: ["tool", "resource_type", "module", "outcome", "action"] as const,
  registers: [registry],
});

/**
 * Higher-order function that wraps a tool handler to automatically record
 * Prometheus metrics on every invocation.
 *
 * Outcome classification:
 *   - "ok"         — handler returned successfully with no isError flag
 *   - "tool_error" — handler returned isError:true, or threw a user-fixable error
 *   - "error"      — handler threw a system/infrastructure error
 *
 * Metrics failures are always swallowed and logged as warnings to ensure
 * instrumentation never breaks tool callers.
 *
 * @param toolName       The MCP tool name (e.g. "harness_list", "harness_execute")
 * @param harnessRegistry The Harness resource registry for module resolution
 */
export function withMetrics(
  toolName: string,
  harnessRegistry: HarnessRegistry,
): (handler: ToolHandler) => ToolHandler {
  return (handler) => async (args) => {
    const resourceType = typeof args.resource_type === "string" ? args.resource_type : "";

    // Resolve module name from registry; fall back to "platform" on any failure
    let module = "platform";
    if (resourceType) {
      try {
        module = harnessRegistry.getResource(resourceType).toolset;
      } catch {
        module = "platform";
      }
    }

    const labels = { tool: toolName, resource_type: resourceType, module };
    const end = toolCallDuration.startTimer(labels);
    let outcome: "ok" | "tool_error" | "error" = "ok";

    try {
      const result = await handler(args);
      outcome = result.isError ? "tool_error" : "ok";
      return result;
    } catch (err) {
      if (isUserError(err) || isUserFixableApiError(err)) {
        outcome = "tool_error";
      } else {
        outcome = "error";
      }
      throw err;
    } finally {
      try {
        end();
        toolCallsTotal.inc({ ...labels, outcome });
        if (toolName === "harness_execute" && typeof args.action === "string") {
          toolExecutionsTotal.inc({ ...labels, outcome, action: args.action });
        }
      } catch (metricsErr) {
        log.warn("Failed to record tool metrics", { error: String(metricsErr) });
      }
    }
  };
}
