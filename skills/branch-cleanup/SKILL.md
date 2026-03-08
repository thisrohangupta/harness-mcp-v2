---
name: branch-cleanup
description: Analyze branches in a Harness Code repository and recommend stale or merged branches to delete. Use when the user wants to clean up old branches, find stale branches, or reduce repository clutter. Identifies merged, stale, and active branches with safe deletion recommendations.
---

# Branch Cleanup

Analyze and clean up stale or merged branches.

## When to Use

- User wants to clean up old branches
- User asks about stale branches or repository maintenance
- User wants to reduce branch clutter
- User mentions branch hygiene or repository cleanup

## Instructions

### Step 1 — List branches

Call `harness_list` with `resource_type="branch"` to get all branches in the repository. Also identify the default branch (usually `main` or `master`).

### Step 2 — Check merge status

- Call `harness_list` with `resource_type="pull_request"` and `state="merged"` to find branches that have been merged
- Call `harness_list` with `resource_type="pull_request"` and `state="closed"` to find branches from closed (abandoned) PRs

### Step 3 — Classify branches

Categorize each branch:
- **Safe to delete (merged)**: Branch was merged via PR — contents are in the default branch
- **Likely stale**: No commits or activity in 30+ days and no open PR
- **Active**: Recent commits or an open PR — keep these

### Step 4 — Present cleanup plan

Provide a prioritized list:

| Branch | Status | Last Activity | PR | Recommendation |
|--------|--------|---------------|-----|----------------|
| ... | Merged | ... | #123 | Safe to delete |
| ... | Stale | 60 days ago | None | Review and delete |
| ... | Active | 2 days ago | #456 | Keep |

### Step 5 — Delete (with confirmation)

After user confirms which branches to delete:
- Use `harness_delete` with `resource_type="branch"` for each confirmed branch
- Never delete the default branch or protected branches
- Report which branches were deleted and which were skipped
