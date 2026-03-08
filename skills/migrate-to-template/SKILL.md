---
name: migrate-to-template
description: Analyze an existing Harness pipeline and extract reusable stage or step templates from it. Use when the user wants to reduce pipeline duplication, create shared templates, or standardize pipeline patterns across teams. Identifies repeated patterns and generates parameterized templates.
---

# Migrate Pipeline to Template

Extract reusable templates from an existing pipeline.

## When to Use

- User wants to reduce pipeline duplication
- User mentions templates, reusability, or standardization
- Multiple pipelines share similar stages or steps
- User wants to DRY up their pipeline configurations

## Instructions

### Step 1 — Get the pipeline

Call `harness_get` with `resource_type="pipeline"` and the pipeline identifier to retrieve the full YAML definition.

### Step 2 — Review existing templates

Call `harness_list` with `resource_type="template"` to see what templates already exist in the project. Avoid duplicating existing templates.

### Step 3 — Identify reusable patterns

Analyze the pipeline YAML for:
- **Stages** that could be reused across pipelines (build stages, deployment stages, approval stages)
- **Steps** that repeat with slight variations (Docker build, test execution, notification steps)
- **Step groups** that form a logical unit of work

### Step 4 — Generate templates

For each identified pattern:
- Create a parameterized template YAML with `<+input>` expressions for variable values
- Ensure template inputs have sensible defaults where possible
- Include a description explaining when to use the template
- Define the template scope (project, org, or account level)

### Step 5 — Generate updated pipeline

Create a new version of the original pipeline that uses `templateRef` to reference the new templates instead of inline definitions.

### Step 6 — Present for review

Show the user:
- Each template with its parameters
- The updated pipeline using the templates
- Before/after comparison showing the reduction in duplication

Do NOT create templates or update the pipeline until the user confirms.
