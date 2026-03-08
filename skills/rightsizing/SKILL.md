---
name: rightsizing
description: Review and prioritize rightsizing recommendations from Harness Cloud Cost Management. Use when the user wants to identify over-provisioned resources, reduce waste, or implement resource right-sizing. Can optionally create Jira or ServiceNow tickets for tracking.
---

# Rightsizing Recommendations

Review and prioritize rightsizing recommendations.

## When to Use

- User wants to rightsize cloud resources
- User mentions over-provisioned, underutilized, or wasted resources
- User wants to reduce resource costs
- User asks about instance sizing or resource optimization

## Instructions

### Step 1 — Get recommendation data

- Call `harness_get` with `resource_type="cost_recommendation_stats"` for aggregate statistics
- Call `harness_list` with `resource_type="cost_recommendation_by_type"` for recommendations grouped by type
- Call `harness_list` with `resource_type="cost_recommendation"` for the full list of recommendations

If the user specifies a minimum savings threshold, filter accordingly.

### Step 2 — Rank by savings

Sort recommendations by estimated monthly savings (highest first).

### Step 3 — Present recommendations

For each recommendation:
- **Resource**: Name, type, region, cloud provider
- **Current**: Current instance type/size and utilization
- **Recommended**: Suggested instance type/size
- **Savings**: Estimated monthly savings
- **Risk**: Impact risk level (low for oversized resources, medium for right-at-threshold resources)

### Step 4 — Group by risk

Organize recommendations into groups:
- **Safe bets** (low risk, high savings) — implement immediately
- **Worth investigating** (medium risk) — validate before implementing
- **Proceed with caution** (higher risk) — needs load testing first

### Step 5 — Take action (optional)

If the user wants to act on recommendations:
- Update recommendation state using `harness_execute` with `resource_type="cost_recommendation"` and `action="update_state"`
- Create Jira tickets using `action="create_jira_ticket"` for tracking
- Create ServiceNow tickets using `action="create_snow_ticket"` for ITSM tracking
