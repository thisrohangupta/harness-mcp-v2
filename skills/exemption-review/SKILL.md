---
name: exemption-review
description: Review pending security exemptions and make batch approval or rejection decisions. Use when the user needs to review security exemption requests, approve or reject exemptions, or audit existing exemptions for policy compliance.
---

# Security Exemption Review

Review and act on pending security exemptions.

## When to Use

- User needs to review security exemption requests
- User wants to approve or reject pending exemptions
- User asks about security waivers or exception requests
- User wants to audit existing exemptions

## Instructions

### Step 1 — List exemptions

Call `harness_list` with `resource_type="security_exemption"` to get all pending exemption requests.

### Step 2 — Get security context

For each exemption, understand the underlying security issue:
- Call `harness_get` with `resource_type="security_issue"` for the related vulnerability details
- Assess the actual risk of the exempted issue

### Step 3 — Evaluate each exemption

For each pending exemption, assess:
- **Justification**: Is the reason for the exemption valid?
- **Risk**: What's the actual risk of leaving this unpatched?
- **Compensating controls**: Are there mitigations in place?
- **Expiration**: Is the exemption time-bounded and reasonable?
- **Scope**: Is the exemption narrowly scoped to the affected component?

### Step 4 — Present review table

| Exemption | Issue | Severity | Justification | Risk | Recommendation |
|-----------|-------|----------|---------------|------|----------------|
| ... | ... | ... | ... | ... | Approve/Reject/Needs discussion |

### Step 5 — Execute decisions (with confirmation)

After the user reviews the recommendations:
- **Approve**: Use `harness_execute` with `resource_type="security_exemption"` and `action="approve"`
- **Reject**: Use `harness_execute` with `resource_type="security_exemption"` and `action="reject"`
- **Promote**: Use `action="promote"` to escalate exemptions to a broader scope

Always confirm before executing any action.
