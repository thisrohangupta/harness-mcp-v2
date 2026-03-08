---
name: pr-summary
description: Auto-generate a pull request title and description from the commit history and diff of a branch. Use when the user needs help writing a PR description, wants to summarize changes before creating a PR, or needs a well-structured PR template filled in automatically.
---

# PR Summary

Auto-generate a PR title and description from code changes.

## When to Use

- User wants help writing a PR description
- User says "summarize this branch", "generate PR description", or "write the PR summary"
- User has a branch ready and wants a well-structured PR before creating it
- User wants to document what changed in a set of commits

## Instructions

### Step 1 — Get commit history

Call `harness_list` with `resource_type="commit"` scoped to the source branch to see all commits that will be in the PR.

### Step 2 — Get diff information

- Call `harness_execute` with `resource_type="commit"` and `action="diff_stats"` to get the quantitative diff (files changed, lines added/removed)
- Call `harness_execute` with `resource_type="commit"` and `action="diff"` to get the actual code diff for content analysis

### Step 3 — Generate PR title

Write a concise title (72 characters or less) that captures the primary change. Follow the project's commit message conventions if identifiable.

### Step 4 — Generate PR description

Structure the description as:

**Summary**: One paragraph explaining what the PR does and why.

**Changes**:
- Bulleted list of the key changes, grouped logically
- Reference specific files or modules affected

**Testing**:
- How the changes were tested
- Any new tests added
- Edge cases considered

**Breaking Changes**: (if any)
- What breaks and how to migrate

**Related Issues**: (if identifiable from commit messages)
- Link to any referenced issues or tickets

### Step 5 — Present for review

Show the generated title and description. The user can then use this to create or update their PR.
