---
name: create-pipeline
description: Generate a new Harness CI/CD pipeline from natural language requirements. Use when the user wants to create a new pipeline, set up a build, or configure a deployment workflow. Reviews the pipeline JSON schema, checks existing resources for context, and generates valid pipeline YAML.
---

# Create Pipeline

Generate a new Harness pipeline YAML from requirements.

## When to Use

- User wants to create a new CI or CD pipeline
- User says "create a pipeline", "set up a build", or "configure deployment"
- User describes what a pipeline should do in natural language
- User wants to automate a workflow in Harness

## Instructions

### Step 1 — Understand the schema

Call `harness_describe` with `resource_type="pipeline"` to understand available operations and field requirements.

### Step 2 — Review existing resources

Gather context about what's already available:
- Call `harness_list` with `resource_type="pipeline"` to see existing pipeline patterns in the project
- Call `harness_list` with `resource_type="connector"` to find available connectors (Docker registries, Git repos, cloud providers)
- Call `harness_list` with `resource_type="service"` to see existing services
- Call `harness_list` with `resource_type="environment"` to see available environments

### Step 3 — Generate pipeline YAML

Based on the user's requirements and the available resources:
- Generate a valid Harness pipeline YAML
- Use existing connectors and infrastructure where possible
- Follow Harness best practices (parameterized inputs, proper stage ordering, approval gates for production)
- Include stage-level and step-level descriptions

### Step 4 — Present for review

Show the complete pipeline YAML to the user. Explain:
- What each stage does
- Which connectors/services/environments it references
- Any runtime inputs the user needs to provide

Do NOT create the pipeline until the user confirms.

### Step 5 — Create the pipeline

After user confirmation, call `harness_create` with `resource_type="pipeline"` and the YAML body.
Provide the Harness UI deep link to the newly created pipeline.
