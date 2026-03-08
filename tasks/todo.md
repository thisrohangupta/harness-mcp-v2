# Harness MCP Server — Task Tracking

## Phase 1: Foundation ✅
- [x] Project scaffolding (package.json, tsconfig, pnpm)
- [x] Config validation with Zod
- [x] HarnessClient with auth, retry, error handling
- [x] Logger (stderr only)
- [x] Rate limiter
- [x] Error utilities
- [x] Deep-link builder
- [x] Response formatter

## Phase 2: Registry + Core Toolsets ✅
- [x] Registry types (ResourceDefinition, EndpointSpec, ToolsetDefinition)
- [x] Pipelines toolset (pipeline, execution, trigger, input_set)
- [x] Services toolset
- [x] Environments toolset
- [x] Connectors toolset
- [x] Infrastructure toolset
- [x] Secrets toolset (read-only)
- [x] Logs toolset
- [x] Audit toolset
- [x] Master registry with dispatch() + dispatchExecute()

## Phase 3: Tools + Entrypoint ✅
- [x] harness_list
- [x] harness_get
- [x] harness_create (with confirmation gate)
- [x] harness_update (with confirmation gate)
- [x] harness_delete (with confirmation gate)
- [x] harness_execute
- [x] harness_diagnose
- [x] harness_search
- [x] harness_describe
- [x] tools/index.ts — registerAllTools()
- [x] src/index.ts — server entrypoint

## Phase 4: Remaining Toolsets + Resources + Prompts ✅
- [x] Delegates toolset
- [x] Repositories toolset
- [x] Registries toolset
- [x] Templates toolset
- [x] Dashboards toolset
- [x] IDP toolset
- [x] Pull Requests toolset
- [x] Feature Flags toolset
- [x] GitOps toolset
- [x] Chaos toolset
- [x] CCM toolset
- [x] SEI toolset
- [x] SCS toolset
- [x] STO toolset
- [x] Pipeline YAML resource
- [x] Execution summary resource
- [x] Debug pipeline prompt
- [x] Create pipeline prompt

## Phase 5: Verification ✅
- [x] TypeScript build succeeds (0 errors)
- [ ] MCP Inspector verification
- [ ] Real Harness API integration test
- [ ] README.md

## Phase 6: Cursor Plugin + Agent Skills ✅
- [x] `.cursor-plugin/plugin.json` — Plugin manifest
- [x] `.mcp.json` — MCP server connection config
- [x] 26 SKILL.md files organized by domain:
  - CI/CD: build-deploy-app, debug-pipeline, create-pipeline, onboard-service, pending-approvals
  - DevOps: setup-gitops, dora-metrics, chaos-resilience, feature-flag-rollout, delegate-health, migrate-to-template, developer-scorecard
  - FinOps: optimize-costs, cloud-cost-breakdown, rightsizing, cost-anomaly, commitment-utilization
  - Security: security-review, vulnerability-triage, sbom-compliance, supply-chain-audit, exemption-review, access-control-audit
  - Code: code-review, pr-summary, branch-cleanup
- [x] README updated with plugin/skills documentation
- [x] package.json updated to include plugin files in npm distribution
- [x] All 167 tests pass
