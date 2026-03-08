---
name: setup-gitops
description: Guide through onboarding a GitOps application in Harness. Use when the user wants to set up GitOps, deploy using Argo CD, or configure a GitOps agent, cluster, and repository. Verifies agent health, checks clusters and repos, and creates the GitOps application.
---

# Setup GitOps Application

Guide through onboarding a GitOps application in Harness.

## When to Use

- User wants to set up GitOps for an application
- User mentions Argo CD, GitOps, or declarative deployments
- User wants to sync an application from a Git repo to a Kubernetes cluster

## Instructions

### Step 1 — Verify GitOps agent

Call `harness_list` with `resource_type="gitops_agent"` to list available agents. Verify at least one agent is healthy and connected.

If no agents are available, explain that a GitOps agent must be installed in the target cluster first and provide a link to the Harness documentation.

### Step 2 — Check clusters

Call `harness_list` with `resource_type="gitops_cluster"` to list available clusters. Identify the target cluster for the deployment.

### Step 3 — Check repositories

Call `harness_list` with `resource_type="gitops_repository"` to list registered Git repositories. Verify the application's repo is registered.

If the repo isn't registered, help the user add it.

### Step 4 — Review existing applications

Call `harness_list` with `resource_type="gitops_application"` to see existing applications and patterns.

### Step 5 — Create the application

Based on the gathered context:
- Propose a GitOps application spec (repository, path, target cluster, namespace, sync policy)
- Explain the sync strategy (automatic vs manual, self-heal, prune)
- Present the application definition for review

Do NOT create until the user confirms.

### Step 6 — Verify sync

After creation, use `harness_get` with `resource_type="gitops_application"` to check the sync status. If out of sync, offer to trigger a sync using `harness_execute` with `resource_type="gitops_application"` and `action="sync"`.
