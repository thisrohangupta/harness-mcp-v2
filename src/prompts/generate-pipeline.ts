import * as z from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerGeneratePipelinePrompt(server: McpServer): void {
  server.registerPrompt(
    "generate-pipeline",
    {
      description:
        "Advanced pipeline generation: discovers existing templates, connectors, and infrastructure in your Harness project, then generates production-ready pipeline YAML tailored to your stack",
      argsSchema: {
        description: z.string().describe("Describe what the pipeline should do, including technologies, deployment targets, and any specific requirements"),
        projectId: z.string().describe("Target Harness project identifier").optional(),
        orgId: z.string().describe("Harness organization identifier (overrides default)").optional(),
        pipelineType: z.enum(["CI", "CD", "CI_CD"]).describe("Pipeline type: CI (build/test), CD (deploy), or CI_CD (end-to-end)").optional(),
      },
    },
    async ({ description, projectId, orgId, pipelineType }) => {
      const scopeParams = [
        orgId ? `org_id="${orgId}"` : null,
        projectId ? `project_id="${projectId}"` : null,
      ].filter(Boolean).join(", ");
      const withScope = scopeParams ? `, ${scopeParams}` : "";
      const moduleFilter = pipelineType === "CI" ? "CI" : pipelineType === "CD" ? "CD" : null;

      return {
        messages: [{
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `Generate a production-ready Harness pipeline based on these requirements:

${description}
${pipelineType ? `\nPipeline type: ${pipelineType}` : ""}
${projectId ? `Project: ${projectId}` : ""}
${orgId ? `Organization: ${orgId}` : ""}

Follow these phases IN ORDER. Complete each phase before moving to the next.

---

## Phase 1: DISCOVER — Gather Context from Harness

### Step 1 — Understand the pipeline schema
- Read the pipeline JSON Schema resource (\`schema:///pipeline\`) to understand the required YAML structure and valid fields
- Call harness_describe with resource_type="pipeline" to see available operations and field descriptions

### Step 2 — Search for reusable templates
- Call harness_search with query="${description.slice(0, 80)}"${withScope}, resource_types=["template"] to find templates matching the requirements
- Call harness_list with resource_type="template"${withScope}, filters={template_list_type: "Stable"} to browse all stable templates
${moduleFilter ? `- Also try harness_list with resource_type="template"${withScope}, filters={template_type: "Stage"} and filters={template_type: "Step"} to find stage and step templates separately` : "- Also try harness_list with resource_type=\"template\"" + withScope + ", filters={template_type: \"Pipeline\"} to find full pipeline templates as starting points"}
- For each relevant template found, call harness_get with resource_type="template", resource_id="<template_id>"${withScope} to retrieve the full YAML and understand its required inputs

### Step 3 — Discover existing infrastructure
- Call harness_list with resource_type="connector"${withScope} to find available connectors (Git, Docker registry, cloud providers, etc.)
- Call harness_list with resource_type="service"${withScope} to see existing service definitions
- Call harness_list with resource_type="environment"${withScope} to see available deployment environments
- Call harness_list with resource_type="infrastructure"${withScope} to see available infrastructure definitions
${moduleFilter ? `- Call harness_list with resource_type="pipeline"${withScope}, filters={module: "${moduleFilter}"} to see existing ${moduleFilter} pipeline patterns in the project` : `- Call harness_list with resource_type="pipeline"${withScope} to see existing pipeline patterns in the project`}

### Step 4 — Inspect reference pipelines (if found)
- If Step 3 found similar pipelines, call harness_get with resource_type="pipeline", resource_id="<pipeline_id>"${withScope} on 1-2 relevant ones to study their YAML structure
- Note patterns: stage types, step configurations, connector references, variable usage

---

## Phase 2: DESIGN — Plan the Pipeline Structure

Based on everything discovered in Phase 1, design the pipeline before writing YAML.

Present a structured plan:

1. **Pipeline identifier and name** — follow Harness naming conventions (lowercase, hyphens)
2. **Stages** — list each stage with:
   - Stage type (CI, Deployment, Custom, Approval, etc.)
   - Whether it uses a template (templateRef + versionLabel) or is inline
   - Key steps within each stage
3. **Connectors referenced** — which discovered connectors the pipeline will use
4. **Services and environments** — which existing ones to reference (or note if new ones are needed)
5. **Variables and runtime inputs** — which values should be parameterized as \`<+input>\` for flexibility
6. **Triggers** — any recommended triggers (webhook, cron) for automation

Wait for confirmation before proceeding to Phase 3.

---

## Phase 3: GENERATE — Produce the Pipeline YAML

### Harness Pipeline YAML Rules

Follow these structural rules when generating YAML:

**Top-level structure:**
\`\`\`yaml
pipeline:
  name: "<display name>"
  identifier: "<unique_id>"
  projectIdentifier: "<project>"
  orgIdentifier: "<org>"
  tags: {}
  stages:
    - stage: ...
\`\`\`

**Stage types and their valid step types:**
- **CI stage** (type: CI): Run, BuildAndPushDockerRegistry, BuildAndPushECR, BuildAndPushGCR, BuildAndPushACR, RunTests, Plugin, RestoreCacheS3, SaveCacheS3, Security, GitClone, ArtifactoryUpload, GCSUpload, S3Upload
- **Deployment stage** (type: Deployment): K8sRollingDeploy, K8sCanaryDeploy, K8sBlueGreenDeploy, K8sRollingRollback, HelmDeploy, HelmRollback, TerraformApply, TerraformPlan, TerraformDestroy, ShellScript, Http, Email
- **Custom stage** (type: Custom): ShellScript, Http, Email, Wait, Queue, HarnessApproval, JiraCreate, JiraUpdate, ServiceNowCreate
- **Approval stage** (type: Approval): HarnessApproval, JiraApproval, ServiceNowApproval, CustomApproval
- **Pipeline Chaining stage** (type: Pipeline): reference another pipeline by identifier

**Template references** — when using a discovered template:
\`\`\`yaml
stage:
  name: "Build"
  identifier: build
  template:
    templateRef: "<template_identifier>"
    versionLabel: "<version>"
    templateInputs:
      type: CI
      spec:
        execution:
          steps:
            - step:
                identifier: build_step
                type: Run
                spec:
                  command: <+input>
\`\`\`

**Runtime inputs** — use \`<+input>\` for values the user provides at execution time.
**Expressions** — use \`<+pipeline.variables.varName>\`, \`<+stage.variables.varName>\`, \`<+artifact.tag>\`, etc. for dynamic values.

### Generation rules
- Reference real connector IDs, service IDs, and environment IDs discovered in Phase 1
- Use templates discovered in Step 2 where they match the requirements — prefer stable template versions
- Add \`failureStrategies\` to stages (at minimum: retry on transient failures, manual intervention on unknown errors)
- Include \`timeout\` on long-running steps
- Use variable expressions instead of hardcoded values where appropriate
- Add meaningful \`description\` fields on stages and steps

### Output
- Present the complete pipeline YAML
- List any prerequisites (connectors, services, environments, secrets) that must be created first
- Note any templates used and their version labels

---

## Phase 4: VALIDATE — Verify the YAML

Before presenting the final YAML, self-check:

1. **Schema compliance**: Verify the YAML structure matches the pipeline JSON schema from Step 1
2. **Connector references**: Confirm every connectorRef in the YAML matches a real connector found in Step 3
3. **Template references**: Confirm every templateRef + versionLabel matches a real template found in Step 2
4. **Service/environment references**: Confirm all serviceRef and environmentRef values are valid
5. **Runtime inputs**: Ensure all \`<+input>\` placeholders have clear descriptions in the variables section
6. **Identifier format**: All identifiers must match \`[a-zA-Z_][a-zA-Z0-9_]*\` (no hyphens, no spaces, no leading digits)
7. **No orphan references**: Every referenced entity (connector, service, environment, infrastructure, template) exists in the project

If any reference is invalid, either fix it or clearly call out what needs to be created first.

---

## Phase 5: PRESENT — Show Results

Present the final output:
1. **Pipeline YAML** — the complete, validated YAML
2. **Prerequisites** — any resources that must be created before the pipeline can run (with harness_create commands)
3. **Execution instructions** — how to run the pipeline, including any required runtime inputs
4. **Recommended triggers** — suggested automation (webhook for PR builds, cron for nightly, etc.)

Do NOT create the pipeline until I explicitly confirm. Just show the YAML and plan for review.`,
          },
        }],
      };
    },
  );
}
