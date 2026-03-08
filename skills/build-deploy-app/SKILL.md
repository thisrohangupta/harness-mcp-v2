---
name: build-deploy-app
description: End-to-end CI/CD workflow for building and deploying an application through Harness. Use when the user wants to go from a git repo to a running deployment — scans the repo, generates Dockerfiles if needed, creates CI and CD pipelines in Harness, builds Docker images, generates Kubernetes manifests, and deploys. Handles auto-retry on failures.
---

# Build & Deploy App

Full end-to-end workflow: take a git repo and deploy it through Harness CI/CD.

## When to Use

- User wants to deploy an application from a git repository
- User says "build and deploy", "set up CI/CD", or "deploy this app"
- User provides a repo URL and wants pipelines created automatically
- User wants to go from code to running deployment

## Instructions

Follow these phases strictly in order. Complete each step before moving to the next.
Present all generated YAML for review before creating anything.

### Phase 1: Local Discovery (no MCP tools)

**Step 0 — Clone & verify the repo**
- Clone the provided repo locally (or git pull if already cloned)
- Run `ls -la` to inspect the project structure

**Step 1 — Scan for Dockerfile**
- Look for a Dockerfile (or Dockerfile.*) in the repo root and subdirectories
- If no Dockerfile exists: analyze the codebase (language, framework, dependencies) and generate an optimized multi-stage Dockerfile. Commit it to the repo
- If a Dockerfile exists: read it and verify it follows best practices (multi-stage build, non-root user, .dockerignore)

**Step 2 — Analyze the application**
- Identify the language/framework, exposed ports, environment variables, and health check endpoints
- Note any databases or external services the app depends on
- This context feeds into K8s manifest generation in Phase 3

**Step 3 — Scan for existing Kubernetes manifests**
- Search the repo for existing K8s manifests: look in `k8s/`, `kubernetes/`, `deploy/`, `manifests/`, `helm/`, `.k8s/`, or any `*.yaml`/`*.yml` files containing `apiVersion` and `kind: Deployment`
- If manifests exist: note their paths for the Harness service definition
- If no manifests exist: flag that we need to generate them in Phase 3

### Phase 2: CI Pipeline — Build & Push (MCP tools)

**Step 4 — Check existing Harness resources**
- Call `harness_list` with `resource_type="connector"` to find Docker registry and Git connectors
- Call `harness_list` with `resource_type="service"` to check if this service already exists
- Call `harness_list` with `resource_type="environment"` to see available environments
- Call `harness_describe` with `resource_type="pipeline"` to understand the pipeline schema

**Step 5 — Ensure connectors exist**
- If no Docker registry connector exists: generate connector YAML and present for review
- If no Git connector exists for the repo: generate a Git connector YAML and present for review
- Create any missing connectors using `harness_create` with `resource_type="connector"` (only after user confirmation)

**Step 6 — Generate CI pipeline YAML**
Generate a Harness CI pipeline that:
- Clones the repo using the Git connector
- Builds the Docker image from the Dockerfile
- Tags the image with `<+pipeline.sequenceId>`
- Pushes to the Docker registry
- Includes a build test step if the repo has tests

Present the full pipeline YAML for review. Do NOT create it yet.

**Step 7 — Create & execute CI pipeline (with auto-retry)**
- After user confirms, create using `harness_create` with `resource_type="pipeline"`
- Execute using `harness_execute` with `resource_type="pipeline"`
- Monitor with `harness_status` — poll until complete or failed

**CI failure retry loop (up to 5 attempts):**
1. Call `harness_get` to retrieve execution details and logs
2. Analyze the failure (build error, test failure, Dockerfile issue, etc.)
3. Fix the issue locally or update the pipeline using `harness_update`
4. Re-execute and monitor again
5. After 5 failures: summarize all attempts and provide Harness UI deep links

### Phase 3: CD Pipeline — K8s Manifests & Deploy (MCP tools + local)

**Step 8 — Prepare Kubernetes manifests**
- If manifests exist: review them, parameterize the image reference for Harness
- If no manifests: generate Deployment, Service, ConfigMap/Secret manifests. Save to `k8s/`, commit and push

**Step 9 — Create Harness service & environment**
- Create/update a Harness service referencing the K8s manifests and Docker artifact
- Ensure a target environment exists
- Present YAML for review before creating

**Step 10 — Generate CD pipeline YAML**
Generate a Harness CD pipeline with Rolling deployment strategy, infrastructure definition, and health checks. Present for review.

**Step 11 — Create & execute CD pipeline (with auto-retry)**
- Create and execute the CD pipeline after user confirmation
- CD failure retry loop (up to 3 attempts) — analyze, fix, ask permission, retry

**Step 12 — Verify & report**
- Confirm deployment success
- Display summary with CI/CD execution status, image tag, deployment details, and Harness UI links

## Critical Rules

- Do NOT create any resource without showing YAML and getting user confirmation first
- Do NOT skip steps — complete each one before proceeding
- Use existing connectors/services/environments when available — do not duplicate
- Always reference existing K8s manifests from the repo when available
