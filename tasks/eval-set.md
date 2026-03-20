# MCP Server Eval Set

Evaluation of Harness MCP Server tools: run each case, record response and score.

## Scoring

- **Pass (1)**: Tool succeeded, response has expected shape/content.
- **Partial (0.5)**: Tool ran but response incomplete or API limitation (e.g. 404 for optional feature).
- **Fail (0)**: Error, wrong tool, or empty when data expected.

---

## Eval Results (Run Summary)

**Date:** 2025-02-25  
**Server:** user-harness-poc (Harness MCP)  
**Project:** PM_Signoff (org: default)

### Score Summary

| Metric | Value |
|--------|--------|
| **Total cases** | 10 |
| **Passed** | 10 |
| **Partial** | 0 |
| **Failed** | 0 |
| **Score** | **10 / 10** (100%) |

---

## Per-Case Responses and Scoring

| # | Case ID | Tool | Score | Result | Response summary |
|---|---------|------|--------|--------|-------------------|
| 1 | describe_search | harness_describe | 1 | Pass | 6 resource types (pipeline, pipeline_summary, execution, trigger, input_set, execution_log). |
| 2 | list_pipelines | harness_list | 1 | Pass | items.length=5, total=50; names include Nginx Multi-Environment Deployment, Calendar App CI. |
| 3 | list_services | harness_list | 1 | Pass | items.length=5 (compact); total from API=0 but items present. |
| 4 | list_templates | harness_list | 1 | Pass | items with identifier/name (Rohan, demo1, Deployment…), total=26. |
| 5 | list_environments | harness_list | 1 | Pass | items.length=5; total=0 in response but items present. |
| 6 | get_pipeline | harness_get | 1 | Pass | yamlPipeline with full pipeline JSON; entityValidityDetails.valid=true. |
| 7 | get_service | harness_get | 1 | Pass | service.identifier=kubernetes, name=kubernetes, full YAML and serviceDefinition. |
| 8 | search_nginx | harness_search | 1 | Pass | total_matches=77; results include pipeline (nginx_multi_env_deployment), service, execution, secret, audit_event. |
| 9 | status | harness_status | 1 | Pass | project, failed_executions (3 shown), running_executions=[], recent_activity, summary.health=failing. |
| 10 | describe_template | harness_describe | 1 | Pass | resource_type=template, ops=[list, get], listFilterFields, operations. |

---

## Eval Cases (Reference)

| # | Case ID | Tool | Description | Criteria for Pass |
|---|---------|------|-------------|-------------------|
| 1 | describe_search | harness_describe | Describe resource types with search "pipeline" | Returns list of resource types containing pipeline-related |
| 2 | list_pipelines | harness_list | List pipelines (compact) | items array, total ≥ 0 |
| 3 | list_services | harness_list | List services (compact) | items array, total ≥ 0 |
| 4 | list_templates | harness_list | List templates | items array with identifier/name |
| 5 | list_environments | harness_list | List environments | items array, total ≥ 0 |
| 6 | get_pipeline | harness_get | Get pipeline nginx_multi_env_deployment | Pipeline object / YAML or valid entity |
| 7 | get_service | harness_get | Get service kubernetes | Service object with identifier/name |
| 8 | search_nginx | harness_search | Search "nginx" | Results object, any matches |
| 9 | status | harness_status | Project status | failed_executions, running_executions, summary |
| 10 | describe_template | harness_describe | Describe resource_type template | ops list, description |
