---
name: onboard-service
description: Walk through onboarding a new service into Harness with environments and a deployment pipeline. Use when the user wants to add a new microservice, application, or workload to Harness for the first time. Checks for existing resources, creates the service definition, and sets up deployment pipelines.
---

# Onboard Service

Walk through onboarding a new service into Harness with a complete deployment setup.

## When to Use

- User wants to add a new service to Harness
- User says "onboard", "add a service", or "set up a new microservice"
- A new application needs CI/CD configured in Harness

## Instructions

### Step 1 — Check for existing resources

- Call `harness_search` with the service name to check if it already exists
- Call `harness_list` with `resource_type="service"` to see existing service patterns

### Step 2 — Review available infrastructure

- Call `harness_list` with `resource_type="environment"` to see available environments
- Call `harness_list` with `resource_type="connector"` to see available infrastructure connectors
- Call `harness_list` with `resource_type="infrastructure"` to see deployment targets

### Step 3 — Generate service definition

Create a Harness service YAML definition that:
- Follows existing naming and structure patterns from the project
- Includes the correct artifact source (Docker registry, ECR, GCR, etc.)
- References manifest sources (Git repo with K8s manifests, Helm charts, etc.)

### Step 4 — Generate deployment pipeline

Create a deployment pipeline YAML that:
- Builds the service (if applicable)
- Deploys to dev/staging/prod environments in sequence
- Includes approval gates between staging and production
- Uses the appropriate deployment strategy (Rolling, Blue-Green, or Canary)

### Step 5 — Present for review

Show all generated YAML to the user:
- Service definition
- Pipeline YAML
- Any new environments or infrastructure definitions needed

Do NOT create any resources until the user confirms — present the complete plan first.

### Step 6 — Create resources

After confirmation, create resources in order:
1. Service using `harness_create` with `resource_type="service"`
2. Pipeline using `harness_create` with `resource_type="pipeline"`
3. Provide Harness UI deep links to all created resources
