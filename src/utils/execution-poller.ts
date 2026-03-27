/**
 * Execution polling utility for waiting on pipeline executions to complete.
 * Stateless — polls via registry.dispatch and sends MCP progress notifications.
 */

import type { HarnessClient } from "../client/harness-client.js";
import type { Registry } from "../registry/index.js";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type { ServerRequest, ServerNotification } from "@modelcontextprotocol/sdk/types.js";
import { sendProgress } from "./progress.js";
import { createLogger } from "./logger.js";
import { asRecord, asString } from "./type-guards.js";

const log = createLogger("execution-poller");

type Extra = RequestHandlerExtra<ServerRequest, ServerNotification>;

export interface PollExecutionOptions {
  /** Execution ID to poll */
  executionId: string;
  /** Organization ID */
  orgId: string;
  /** Project ID */
  projectId: string;
  /** Polling interval in milliseconds (default: 10000 = 10s) */
  pollIntervalMs?: number;
  /** Maximum wait time in milliseconds (default: 1800000 = 30min) */
  timeoutMs?: number;
  /** MCP request extra for sending progress notifications */
  extra?: Extra;
  /** Abort signal for cancellation */
  signal?: AbortSignal;
}

export interface ExecutionStatus {
  executionId: string;
  status: string;
  pipelineIdentifier?: string;
  name?: string;
  startTs?: number;
  endTs?: number;
  currentStage?: string;
  failureInfo?: string;
  raw: unknown;
}

/** Terminal execution statuses that indicate completion */
const TERMINAL_STATUSES = new Set([
  "Success",
  "Failed",
  "Aborted",
  "Expired",
  "AbortedByFreeze",
]);

/** Running/active execution statuses */
const ACTIVE_STATUSES = new Set([
  "Running",
  "Paused",
  "Waiting",
]);

/**
 * Poll a pipeline execution until it reaches a terminal state.
 * Sends progress updates via MCP if extra is provided.
 *
 * @throws Error if timeout is reached or execution fails
 * @returns Final execution status
 */
export async function pollExecutionToCompletion(
  client: HarnessClient,
  registry: Registry,
  options: PollExecutionOptions,
): Promise<ExecutionStatus> {
  const {
    executionId,
    orgId,
    projectId,
    pollIntervalMs = 10000,
    timeoutMs = 1800000, // 30 minutes
    extra,
    signal,
  } = options;

  const startTime = Date.now();
  let iteration = 0;

  log.info("Starting execution poll", {
    executionId,
    pollIntervalMs,
    timeoutMs,
  });

  while (true) {
    iteration++;

    // Check abort signal
    if (signal?.aborted) {
      throw new Error("Execution polling was cancelled");
    }

    // Check timeout
    const elapsed = Date.now() - startTime;
    if (elapsed >= timeoutMs) {
      throw new Error(
        `Execution polling timed out after ${Math.round(elapsed / 1000)}s. ` +
        `Execution may still be running in Harness. ` +
        `Check status with: harness_get(resource_type="execution", resource_id="${executionId}")`
      );
    }

    // Fetch current execution status
    let executionData: unknown;
    try {
      executionData = await registry.dispatch(
        client,
        "execution",
        "get",
        {
          execution_id: executionId,
          org_id: orgId,
          project_id: projectId,
        },
        signal,
      );
    } catch (err) {
      log.error("Failed to fetch execution status", {
        executionId,
        iteration,
        error: String(err),
      });
      throw new Error(
        `Failed to poll execution status: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    // Extract status information
    const status = parseExecutionStatus(executionId, executionData);

    log.debug("Poll iteration", {
      iteration,
      executionId,
      status: status.status,
      currentStage: status.currentStage,
      elapsed: `${Math.round(elapsed / 1000)}s`,
    });

    // Send progress update
    if (extra) {
      const progressMsg = buildProgressMessage(status, elapsed);
      const progressPercent = estimateProgress(status, elapsed, timeoutMs);
      await sendProgress(extra, progressPercent, 100, progressMsg);
    }

    // Check for terminal state
    if (TERMINAL_STATUSES.has(status.status)) {
      log.info("Execution completed", {
        executionId,
        status: status.status,
        duration: status.endTs && status.startTs
          ? `${Math.round((status.endTs - status.startTs) / 1000)}s`
          : "unknown",
      });

      // Send final progress
      if (extra) {
        const finalMsg = status.status === "Success"
          ? `✓ Pipeline succeeded`
          : status.status === "Failed"
          ? `✗ Pipeline failed`
          : `Pipeline ${status.status.toLowerCase()}`;
        await sendProgress(extra, 100, 100, finalMsg);
      }

      return status;
    }

    // Not terminal yet — wait before next poll
    await sleep(pollIntervalMs, signal);
  }
}

/**
 * Parse execution data into a structured status object
 */
function parseExecutionStatus(executionId: string, data: unknown): ExecutionStatus {
  const record = asRecord(data);
  const summary = asRecord(record?.pipelineExecutionSummary);

  const status: ExecutionStatus = {
    executionId,
    status: asString(summary?.status) ?? "Unknown",
    pipelineIdentifier: asString(summary?.pipelineIdentifier),
    name: asString(summary?.name),
    startTs: typeof summary?.startTs === "number" ? summary.startTs : undefined,
    endTs: typeof summary?.endTs === "number" ? summary.endTs : undefined,
    raw: data,
  };

  // Extract current stage info if running
  if (ACTIVE_STATUSES.has(status.status)) {
    const layoutNodeMap = asRecord(record?.layoutNodeMap);
    if (layoutNodeMap) {
      // Find the currently running stage
      for (const [key, node] of Object.entries(layoutNodeMap)) {
        const nodeRecord = asRecord(node);
        const nodeStatus = asString(nodeRecord?.status);
        if (nodeStatus === "Running" || nodeStatus === "AsyncWaiting") {
          status.currentStage = asString(nodeRecord?.name) ?? key;
          break;
        }
      }
    }
  }

  // Extract failure info if failed
  if (status.status === "Failed") {
    const failureInfo = asRecord(summary?.failureInfo);
    status.failureInfo = asString(failureInfo?.message);
  }

  return status;
}

/**
 * Build a human-readable progress message
 */
function buildProgressMessage(status: ExecutionStatus, elapsedMs: number): string {
  const elapsedSec = Math.round(elapsedMs / 1000);
  const elapsed = elapsedSec < 60
    ? `${elapsedSec}s`
    : `${Math.round(elapsedSec / 60)}m`;

  if (status.status === "Running") {
    if (status.currentStage) {
      return `Running: ${status.currentStage} (${elapsed})`;
    }
    return `Pipeline running (${elapsed})`;
  }

  if (status.status === "Waiting") {
    return `Waiting for approval/resource (${elapsed})`;
  }

  if (status.status === "Paused") {
    return `Pipeline paused (${elapsed})`;
  }

  if (status.status === "NotStarted" || status.status === "Queued") {
    return `Pipeline queued (${elapsed})`;
  }

  return `Pipeline ${status.status.toLowerCase()} (${elapsed})`;
}

/**
 * Estimate progress percentage based on elapsed time and status
 * This is a rough heuristic since we don't know the total pipeline duration
 */
function estimateProgress(
  status: ExecutionStatus,
  elapsedMs: number,
  timeoutMs: number,
): number {
  // Terminal states
  if (TERMINAL_STATUSES.has(status.status)) {
    return 100;
  }

  // Not started / queued
  if (status.status === "NotStarted" || status.status === "Queued") {
    return 5;
  }

  // Active states — estimate based on elapsed time
  // Use 70% of timeout as "expected duration" to avoid hitting 100% prematurely
  const expectedDuration = timeoutMs * 0.7;
  const progress = Math.min(95, 10 + (elapsedMs / expectedDuration) * 85);
  return Math.round(progress);
}

/**
 * Sleep for the specified duration, respecting abort signals
 */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("Cancelled"));
      return;
    }

    const timeout = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timeout);
      reject(new Error("Cancelled"));
    };

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
