---
name: debug-pipeline
description: Diagnose and debug a failed Harness pipeline execution. Use when a pipeline has failed, a build is broken, or the user wants to understand why a deployment failed. Analyzes execution logs, identifies the failed step, determines root cause, and suggests fixes. Accepts execution IDs, pipeline IDs, or Harness URLs.
---

# Debug Pipeline Failure

Analyze a failed Harness pipeline execution and provide actionable fixes.

## When to Use

- A pipeline execution has failed
- User says "debug", "why did this fail", "fix this pipeline", or "what went wrong"
- User pastes a Harness execution URL
- User mentions a broken build or failed deployment

## Instructions

### Step 1 — Get the diagnostic report

Call `harness_diagnose` with the execution identifier:
- If given an execution ID: use `execution_id="..."`
- If given a pipeline ID: use `pipeline_id="..."` (auto-fetches the latest execution)
- If given a Harness URL: use `url="..."`

Set `include_logs=true` to get failed step logs in the response.

### Step 2 — Analyze the diagnostic payload

Examine these sections of the diagnostic response:

- **failure section**: Look at the failed stage name, failed step name, error message, and delegate info
- **child_pipeline section**: If present, the failure is in a chained pipeline — focus on the child's failure details, not the parent
- **failed_step_logs**: Read the actual log output from the failed steps. Look for:
  - Error patterns and stack traces
  - Exit codes (non-zero exit codes indicate the specific failure)
  - Permission denied or auth errors
  - Resource not found messages
  - Timeout indicators

### Step 3 — Provide the analysis

Structure your response as:

1. **Root cause** — What specifically caused the failure
2. **Which step failed and why** — The exact stage/step with error details
3. **Suggested fix** — Specific, actionable steps to resolve the issue
4. **Similar patterns** — If this looks like a common failure type (delegate connectivity, Docker pull limits, OOM, flaky tests), mention the pattern and long-term fix

### Step 4 — Offer next actions

- Offer to retry the execution using `harness_execute` with `resource_type="pipeline"` and `action="retry"`
- If a pipeline YAML change is needed, offer to update it using `harness_update` with `resource_type="pipeline"`
- Provide the Harness UI deep link to the execution for manual investigation
