---
name: delegate-health
description: Check Harness delegate connectivity, health, and token status with troubleshooting guidance. Use when delegates are disconnected, pipelines fail due to infrastructure issues, or the user wants to verify delegate health and capacity. Produces a health table and diagnoses unhealthy delegates.
---

# Delegate Health Check

Check delegate connectivity, health, and token status.

## When to Use

- User reports delegate connectivity issues
- Pipelines are failing with delegate-related errors
- User wants to verify delegate health and capacity
- User mentions "delegate", "infrastructure", or "connectivity issues"

## Instructions

### Step 1 — List delegates

Call `harness_list` with `resource_type="delegate"` to get all delegates in the account. Note their names, statuses, versions, and last heartbeat times.

### Step 2 — Check delegate tokens

Call `harness_list` with `resource_type="delegate_token"` to review token status. Check for:
- Expired tokens
- Tokens expiring within the next 30 days
- Revoked tokens still in use

### Step 3 — Produce health table

Create a health assessment table:

| Delegate | Status | Version | Last Heartbeat | Token | Issues |
|----------|--------|---------|----------------|-------|--------|
| ... | Connected/Disconnected | ... | ... | Active/Expiring | ... |

### Step 4 — Diagnose issues

For each unhealthy or disconnected delegate:
- Identify the likely cause (network, resource exhaustion, version mismatch, token expiry)
- Provide specific troubleshooting steps
- Suggest remediation actions

### Step 5 — Recommendations

- Flag delegates with outdated versions that need upgrading
- Flag tokens expiring within 30 days
- Recommend capacity adjustments if delegates are overloaded
- Suggest adding replicas if there's a single point of failure
