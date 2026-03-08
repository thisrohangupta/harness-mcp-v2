---
name: code-review
description: Review a Harness Code pull request — analyze diff, commits, checks, and comments to provide structured feedback on bugs, security, performance, and style. Use when the user wants an AI code review of a PR, needs a second opinion on code changes, or wants to catch issues before merging.
---

# Code Review

Review a pull request with structured feedback.

## When to Use

- User wants an AI code review of a pull request
- User says "review this PR", "check this code", or "what do you think of these changes"
- User provides a PR number and wants feedback
- User wants to catch bugs, security issues, or performance problems before merging

## Instructions

### Step 1 — Get PR details

- Call `harness_get` with `resource_type="pull_request"` to get the PR metadata (title, description, author, source/target branches)
- Call `harness_list` with `resource_type="pr_comment"` to see existing review comments
- Call `harness_list` with `resource_type="pr_check"` to see CI check results
- Call `harness_list` with `resource_type="pr_activity"` to see the full activity timeline

### Step 2 — Analyze the changes

- Call `harness_list` with `resource_type="commit"` scoped to the PR's source branch to see commit history
- Call `harness_execute` with `resource_type="commit"` and `action="diff_stats"` to get the diff statistics
- Call `harness_execute` with `resource_type="commit"` and `action="diff"` to get the actual code diff

### Step 3 — Produce summary

Write a high-level summary:
- What the PR does (one paragraph)
- Scope of changes (files changed, lines added/removed)
- CI check status (passing/failing)

### Step 4 — Detailed findings

Review the code for:
- **Bugs**: Logic errors, null pointer risks, off-by-one errors, race conditions
- **Security**: Injection risks, hardcoded secrets, insecure defaults, missing auth checks
- **Performance**: N+1 queries, unnecessary allocations, missing caching, unbounded loops
- **Style**: Naming conventions, code organization, missing types, unused imports
- **Testing**: Adequate test coverage, edge cases, missing assertions

For each finding, provide:
- File and line reference
- What the issue is
- Suggested fix (with code snippet if helpful)
- Severity (critical, suggestion, nit)

### Step 5 — Verdict

Provide an overall verdict:
- **Approve**: Ready to merge with minor nits
- **Request changes**: Issues that must be addressed before merging
- **Comment**: Observations that don't block merging

### Step 6 — Post comments (optional)

If the user wants, post review comments using `harness_create` with `resource_type="pr_comment"` or submit a formal review using `harness_execute` with `resource_type="pr_reviewer"` and `action="submit_review"`.
