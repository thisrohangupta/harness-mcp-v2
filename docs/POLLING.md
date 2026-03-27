# Pipeline Execution Polling

## Overview

The `harness_execute` tool supports **synchronous waiting** for pipeline executions via the `wait` parameter. When enabled, the tool will:

1. Execute the pipeline (run/retry action)
2. Poll the execution status at regular intervals
3. Send MCP progress notifications during polling
4. Return the final execution state when complete (Success, Failed, etc.)

**Important:** `wait=true` **blocks the tool call** until completion. This is perfect for quick pipelines (<5min) or automation scripts.

**For long pipelines** where you want to "keep coding" while monitoring, use `wait=false` (default) and let your AI assistant spawn a background monitoring agent instead. See [When NOT to Use wait=true](#when-not-to-use-waittrue) for details.

## Parameters

### wait (boolean, optional, default: false)
Wait for pipeline execution to complete. Only applies to pipeline `run` and `retry` actions.

### poll_interval_sec (number, optional, default: 10)
Polling interval in seconds when `wait=true`.
- Minimum: 5 seconds
- Maximum: 60 seconds
- Default: 10 seconds

### timeout_min (number, optional, default: 30)
Maximum wait time in minutes when `wait=true`.
- Minimum: 1 minute
- Maximum: 120 minutes (2 hours)
- Default: 30 minutes

If the timeout is reached, the tool returns an error but the pipeline continues running in Harness.

## Usage Examples

### Basic: Execute and wait with defaults
```json
{
  "resource_type": "pipeline",
  "action": "run",
  "resource_id": "deploy-prod",
  "wait": true
}
```

**Behavior:**
- Starts the pipeline
- Polls every 10 seconds
- Times out after 30 minutes
- Sends progress updates during execution

### Custom polling interval and timeout
```json
{
  "resource_type": "pipeline",
  "action": "run",
  "resource_id": "build-service",
  "inputs": { "branch": "main" },
  "wait": true,
  "poll_interval_sec": 15,
  "timeout_min": 45
}
```

**Behavior:**
- Polls every 15 seconds
- Times out after 45 minutes

### Retry with wait
```json
{
  "resource_type": "pipeline",
  "action": "retry",
  "resource_id": "failed-execution-id",
  "wait": true
}
```

## Response Format

### Without wait (default behavior)
Returns immediately after starting the execution:
```json
{
  "planExecution": {
    "uuid": "exec-123",
    ...
  }
}
```

### With wait=true
Returns after execution completes:
```json
{
  "execution_id": "exec-123",
  "pipeline_id": "deploy-prod",
  "status": "Success",
  "name": "Deploy to Production",
  "started_at": "2026-03-27T12:00:00Z",
  "ended_at": "2026-03-27T12:05:30Z",
  "duration_seconds": 330,
  "_waited": true
}
```

For failed executions:
```json
{
  "execution_id": "exec-456",
  "pipeline_id": "build-service",
  "status": "Failed",
  "started_at": "2026-03-27T12:00:00Z",
  "ended_at": "2026-03-27T12:03:15Z",
  "duration_seconds": 195,
  "failure_reason": "Docker build failed: missing credentials",
  "_waited": true
}
```

## Progress Notifications

During polling, the tool sends MCP progress notifications:

```
Progress: 0/100 - "Pipeline starting (5s)"
Progress: 25/100 - "Running: Build Stage (45s)"
Progress: 60/100 - "Running: Deploy Stage (2m)"
Progress: 100/100 - "✓ Pipeline succeeded"
```

Progress messages include:
- Current stage name (if running)
- Elapsed time
- Status (Running, Waiting for approval, Paused, etc.)

## Error Handling

### Polling timeout
If the execution exceeds `timeout_min`, the tool returns an error:
```json
{
  "error": "Execution polling timed out after 1800s. Execution may still be running in Harness. Check status with: harness_get(resource_type=\"execution\", resource_id=\"exec-123\")"
}
```

### Polling failure
If status polling fails (network error, API error), the tool returns the initial execution response with an error note:
```json
{
  "planExecution": { "uuid": "exec-123", ... },
  "_pollingError": "Failed to poll execution status: 503 Service Unavailable",
  "_note": "Pipeline was started successfully but polling failed. Check execution status manually."
}
```

### Cancellation
If the MCP request is cancelled (client abort), polling stops immediately:
```json
{
  "error": "Execution polling was cancelled"
}
```

The pipeline continues running in Harness even if polling is cancelled.

## Implementation Details

### Stateless Design
- No server-side session state
- Polling happens within the MCP tool call
- Uses registry.dispatch for execution status checks
- Respects MCP abort signals

### Terminal Statuses
Polling stops when execution reaches:
- `Success`
- `Failed`
- `Aborted`
- `Expired`
- `AbortedByFreeze`

### Progress Estimation
Since pipeline duration is unknown, progress is estimated:
- 5%: Queued/Not Started
- 10-95%: Running (based on elapsed time vs 70% of timeout)
- 100%: Terminal state reached

## Integration Patterns

### Claude Code workflow
```
User: "Run the deploy pipeline and wait for it to finish"

Assistant calls:
  harness_execute(
    resource_type="pipeline",
    action="run",
    resource_id="deploy-prod",
    wait=true
  )

User sees progress updates:
  [10%] Pipeline running (15s)
  [35%] Running: Build Stage (1m)
  [65%] Running: Deploy Stage (2m)
  [100%] ✓ Pipeline succeeded

Assistant reports:
  "Deploy completed successfully in 3m 45s"
```

### Error recovery
```
User: "The deploy failed, retry it and wait"

Assistant calls:
  harness_execute(
    resource_type="pipeline",
    action="retry",
    resource_id="failed-exec-id",
    wait=true
  )

On failure:
  harness_diagnose(
    resource_type="execution",
    resource_id="failed-exec-id"
  )
```

## When NOT to Use wait=true

### The "Keep Coding" Use Case

If you want to **continue working while a pipeline runs**, `wait=true` is **not the right approach** because it blocks the tool call.

Instead, use the **async agent-based monitoring pattern** that Claude Code and other AI assistants support natively:

#### Async Monitoring Pattern (Recommended for Long Pipelines)

```
User: "Run the deploy pipeline and let me know when it finishes"

Claude's workflow:
1. Call harness_execute(wait=false) → returns execution_id immediately
2. Spawn a background agent to monitor the execution
3. Return to user: "Deploy pipeline started (exec-123), monitoring in background"
4. User continues coding, asking questions, working with Claude
5. Background agent polls harness_get(resource_type="execution") every 30-60s
6. Agent notifies user when pipeline completes or fails

No MCP server changes needed - this works today!
```

#### Example Conversation

```
User: "Start the integration tests and keep me posted"

Claude:
  → harness_execute(action="run", pipeline_id="integration-tests", wait=false)
  → Returns: { execution_id: "exec-abc123", ... }
  → Spawns background agent to monitor exec-abc123
  → "Integration tests started (exec-abc123). I'll monitor and notify you."

User: "Great. Now help me debug this authentication issue..."

Claude: [Helps with debugging while agent monitors in background]

[5 minutes later]
Background Agent: "Integration tests completed successfully in 4m 32s"
```

### Why Async Monitoring > wait=true for Long Pipelines

| Aspect | wait=true | Async Agent Monitoring |
|--------|-----------|------------------------|
| **Availability** | ❌ Claude blocked during execution | ✅ Claude available for other work |
| **User Experience** | ❌ Must wait for response | ✅ Continue coding immediately |
| **Multiple Pipelines** | ❌ One at a time | ✅ Monitor multiple concurrently |
| **Timeout Risk** | ❌ Fails if pipeline > timeout | ✅ Agent can wait indefinitely |
| **Progress Updates** | ✅ MCP progress notifications | ⚠️ Periodic status checks |

**Use async monitoring when:**
- Pipeline takes > 5 minutes
- You want to continue working
- Monitoring multiple executions
- Pipeline duration is unpredictable

**Use wait=true when:**
- Pipeline takes < 5 minutes
- You want immediate results
- Single-task focus is acceptable
- Automation/scripting context

## Comparison with Alternatives

| Approach | Pros | Cons | Best For |
|----------|------|------|----------|
| **wait=true (Sync)** | • Simple one-call solution<br>• MCP progress updates<br>• Final status guaranteed | • Blocks Claude/AI<br>• Single execution<br>• Timeout limits | Quick tests, automation, <5min pipelines |
| **Agent Monitoring (Async)** | • Non-blocking<br>• Monitor multiple<br>• Continue working | • Requires AI support<br>• Less precise progress | Long pipelines, "keep coding" workflow |
| **Manual Polling** | • Full control<br>• Works everywhere | • Complex (multiple calls)<br>• No auto-notification | Advanced users, custom integrations |
| **VS Code Extension** | • Real-time UI updates<br>• IDE integration | • Extension required<br>• VS Code only | Deep IDE integration needs |

## Best Practices

### Choosing the Right Pattern

1. **Use wait=true (Synchronous) for:**
   - Quick tests and builds (< 5 minutes)
   - Automation scripts where blocking is acceptable
   - Single-task focus workflows
   - When you want guaranteed final status in one call
   - Example: "Run unit tests and show me failures"

2. **Use Agent Monitoring (Async) for:**
   - Long-running pipelines (> 5 minutes)
   - When you want to continue coding during execution
   - Monitoring multiple pipelines concurrently
   - Unpredictable duration pipelines
   - Example: "Deploy to staging and let me know when done"

3. **Set appropriate timeouts (when using wait=true):**
   - Quick tests: `timeout_min=5`
   - Standard builds: `timeout_min=15`
   - Full deployments: `timeout_min=30`
   - Complex workflows: `timeout_min=60`
   - Note: Longer timeouts = longer Claude is blocked

4. **Adjust polling interval (when using wait=true):**
   - Fast pipelines (< 2min): `poll_interval_sec=5`
   - Normal pipelines: `poll_interval_sec=10` (default)
   - Long pipelines: `poll_interval_sec=30`
   - Lower intervals = more API calls but better progress updates

## Troubleshooting

### Timeout too short
**Symptom:** Polling times out but pipeline is still running

**Solution:** Increase `timeout_min` or remove `wait=true` and check status manually:
```json
{
  "resource_type": "execution",
  "resource_id": "exec-id"
}
```

### Slow progress updates
**Symptom:** Progress updates are delayed

**Solution:** Decrease `poll_interval_sec` (minimum 5 seconds)

### Network errors during polling
**Symptom:** Polling fails with "503 Service Unavailable"

**Solution:** Pipeline was started successfully. Check status manually or retry with longer timeout.

## Future Enhancements

Potential improvements (not yet implemented):
- Server-sent events for real-time updates (requires HTTP transport + webhook support)
- Parallel execution monitoring (track multiple pipelines)
- Smart polling (faster interval when near completion)
- Stage-level progress (requires parsing execution graph)
