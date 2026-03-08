---
name: pending-approvals
description: Find pipeline executions waiting for approval and present them for action. Use when the user wants to check on pending approvals, approve or reject pipeline executions, or review what's waiting in the deployment queue. Shows approval details, wait time, and offers to approve or reject.
---

# Pending Approvals

Find and act on pipeline executions waiting for approval.

## When to Use

- User asks about pending approvals or blocked pipelines
- User wants to approve or reject a deployment
- User asks "what's waiting for approval" or "what needs my attention"
- User wants to unblock a pipeline execution

## Instructions

### Step 1 — Find waiting executions

Call `harness_list` with `resource_type="execution"` and `status="ApprovalWaiting"` to find all executions currently blocked on approval.

If scoped to a specific pipeline, also pass `pipeline_id`.

### Step 2 — Get approval details

For each waiting execution:
- Call `harness_list` with `resource_type="approval_instance"` to get the approval details
- Note: approval type (manual, Jira, ServiceNow), message, required approvers, and how long it's been waiting

### Step 3 — Present summary

Display a table of pending approvals:

| Pipeline | Stage | Approval Type | Message | Waiting Since | Approvers | Link |
|----------|-------|--------------|---------|---------------|-----------|------|
| ... | ... | ... | ... | ... | ... | ... |

Include Harness UI deep links to each execution.

### Step 4 — Offer action

Ask the user which approvals they want to act on:
- **Approve**: Use `harness_execute` with `resource_type="approval_instance"` and `action="approve"`
- **Reject**: Use `harness_execute` with `resource_type="approval_instance"` and `action="reject"`

Always confirm before executing an approval action.
