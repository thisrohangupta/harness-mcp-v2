# Test Plan: Execution Log (`execution_log`)

| Field | Value |
|-------|-------|
| **Resource Type** | `execution_log` |
| **Display Name** | Execution Log |
| **Toolset** | logs |
| **Scope** | project |
| **Operations** | get |
| **Execute Actions** | None |
| **Identifier Fields** | prefix |
| **Filter Fields** | execution_id, step_id, stage_id, stage_execution_id |
| **Deep Link** | No |

## Test Cases

| Test ID | Category | Description | Prompt | Expected Result |
|---------|----------|-------------|--------|-----------------|
| TC-log-001 | Get | Get execution log by raw prefix | `harness_get(resource_type="execution_log", prefix="accountId/orgId/projectId/pipelineId/runSequence/nodeId")` | Returns readable log text content for the specified step |
| TC-log-002 | Get | Get execution log by execution_id | `harness_get(resource_type="execution_log", execution_id="abc123xyz")` | Auto-resolves log key from execution metadata and returns log content |
| TC-log-003 | Get | Get execution log with scope overrides | `harness_get(resource_type="execution_log", prefix="my/log/prefix", org_id="other_org", project_id="other_project")` | Returns log from specified org/project scope |
| TC-log-004 | Get | Get execution log for a specific step | `harness_get(resource_type="execution_log", execution_id="exec123", step_id="step_deploy")` | Returns log content for the matching step node when logBaseKey is available |
| TC-log-005 | Get | Get execution log for a specific stage | `harness_get(resource_type="execution_log", execution_id="exec123", stage_id="stage_build")` | Returns stage-scoped log when the selected stage node exposes a log key |
| TC-log-014 | Get | Get execution log for a specific stage execution node | `harness_get(resource_type="execution_log", execution_id="exec123", stage_execution_id="2f4f4f8c-...")` | Returns the matching stage execution log when present |
| TC-log-015 | Diagnose | Diagnose from Harness URL and fetch selected step log | `harness_diagnose(url="https://app.harness.io/ng/account/.../pipelines/myPipeline/executions/abc123XYZ/pipeline?step=2f4f4f8c-...", options={include_logs:true})` | Returns `requested_step_log` for the selected step even when step status is not Failed |
| TC-log-016 | Diagnose | Requested step also appears in failed_step_logs | `harness_diagnose(url="https://app.harness.io/ng/account/.../pipelines/myPipeline/executions/abc123XYZ/pipeline?step=<failed_node_id>", options={include_logs:true, max_failed_steps:1})` | Returns the requested step log once (no duplicate fetch when already present in capped `failed_step_logs`) |
| TC-log-006 | Scope | Get execution log with different org_id | `harness_get(resource_type="execution_log", execution_id="exec123", org_id="custom_org")` | Returns log from specified org |
| TC-log-007 | Scope | Get execution log with different project_id | `harness_get(resource_type="execution_log", execution_id="exec123", org_id="default", project_id="other_project")` | Returns log from specified project |
| TC-log-008 | Error | Get log with non-existent prefix | `harness_get(resource_type="execution_log", prefix="nonexistent/log/prefix/xyz")` | Error or empty: log not found |
| TC-log-009 | Error | Get log with non-existent execution_id | `harness_get(resource_type="execution_log", execution_id="nonexistent_exec_xyz")` | Error: execution not found or no logs available |
| TC-log-010 | Error | Get log without prefix or execution_id | `harness_get(resource_type="execution_log")` | Error: prefix or execution_id is required |
| TC-log-011 | Edge | Get log for a successful execution | `harness_get(resource_type="execution_log", execution_id="successful_exec_id")` | Returns complete log text without error indicators |
| TC-log-012 | Edge | Get log for a failed execution | `harness_get(resource_type="execution_log", execution_id="failed_exec_id")` | Returns log text containing error/failure messages |
| TC-log-013 | Edge | Get log with large output | `harness_get(resource_type="execution_log", execution_id="large_output_exec")` | Returns log text (may be truncated for very large outputs) |

## Notes
- Execution log only supports the `get` operation — no list, create, update, or delete.
- The get operation uses a POST method to `/gateway/log-service/blob/download`.
- The `prefix` identifier is a raw Harness logBaseKey string (e.g. `accountId/orgId/projectId/pipelineId/runSequence/nodeId`).
- The `execution_id` filter auto-resolves the log prefix from execution metadata.
- When `step_id`, `stage_id`, or `stage_execution_id` are provided, prefix resolution prefers matching graph nodes before falling back to pipeline-level logs.
- The response extractor uses `passthrough` — returns raw log text as-is.
- No deep link template is defined for execution logs.
- For best failure analysis, use `harness_diagnose` with `include_logs=true` instead of direct log retrieval.
- When a Harness execution URL includes `?step`, `?stage`, or `?stageExecId`, the MCP parses those values into `step_id`, `stage_id`, and `stage_execution_id` for log-key resolution.
