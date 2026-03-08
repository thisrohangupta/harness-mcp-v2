---
name: security-review
description: Review security issues across Harness resources and suggest remediations by severity. Use when the user wants a security posture overview, needs to review vulnerabilities, or wants to assess the security status of their pipelines and artifacts.
---

# Security Review

Review security issues and suggest remediations.

## When to Use

- User asks for a security overview or posture assessment
- User wants to review security findings across their project
- User mentions security issues, vulnerabilities, or compliance
- User wants to prioritize security remediation

## Instructions

### Step 1 — Gather security data

- Call `harness_list` with `resource_type="security_issue"` to get STO findings, filtering by severity if specified (default: critical,high)
- Call `harness_list` with `resource_type="artifact_security"` to get artifact security posture
- Call `harness_list` with `resource_type="code_repo_security"` to get code repository security status

### Step 2 — Group by service

Organize findings by service/application to give a per-service security view.

### Step 3 — Document each finding

For each security finding:
- **Severity**: Critical, High, Medium, Low
- **Resource**: Which service, pipeline, or artifact is affected
- **Issue**: What the vulnerability or misconfiguration is
- **Remediation**: Specific steps to fix it
- **Priority**: Based on severity + exploitability + exposure

### Step 4 — Present prioritized report

Present findings ordered by priority:
1. **Critical** — Must fix immediately (actively exploitable, internet-exposed)
2. **High** — Fix within the sprint (known CVEs, privilege escalations)
3. **Medium** — Plan to fix (hardening opportunities, best practice violations)
4. **Low** — Track for future (informational, defense-in-depth)

### Step 5 — Summary

Provide an overall security score or health indicator and the top 3 actions that would most improve the security posture.
