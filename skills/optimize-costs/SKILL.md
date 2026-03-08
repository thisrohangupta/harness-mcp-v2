---
name: optimize-costs
description: Analyze cloud cost data and recommend optimizations for a Harness project. Use when the user wants to reduce cloud spending, find cost savings, or get cost optimization recommendations. Surfaces recommendations and anomalies, prioritized by potential savings.
---

# Optimize Costs

Analyze cloud costs and recommend optimizations.

## When to Use

- User wants to reduce cloud spending
- User asks about cost savings or optimization opportunities
- User mentions cloud costs, waste, or overspending
- User wants to review cost recommendations from Harness CCM

## Instructions

### Step 1 — Get cost recommendations

- Call `harness_list` with `resource_type="cost_recommendation"` to get all active recommendations
- Call `harness_get` with `resource_type="cost_recommendation_stats"` to get aggregate savings potential
- Call `harness_list` with `resource_type="cost_anomaly"` to find unusual spending patterns

### Step 2 — Rank by savings

Sort recommendations by potential monthly savings (highest first). Group by category:
- **Rightsizing**: Over-provisioned resources that can be downsized
- **Idle resources**: Resources with very low utilization that can be terminated
- **Reserved instances**: Opportunities to convert on-demand to reserved
- **Spot instances**: Workloads eligible for spot/preemptible instances

### Step 3 — Present findings

For each recommendation:
- **What**: Which resource and what change
- **Savings**: Estimated monthly/annual savings
- **Action**: Specific steps to implement
- **Risk**: Potential impact (low/medium/high) and mitigation

### Step 4 — Surface anomalies

For each cost anomaly:
- When it started
- Which resource/service is affected
- How much over the expected baseline
- Whether it's still ongoing

### Step 5 — Summary table

Present a summary ordered by savings potential:

| Priority | Category | Resource | Monthly Savings | Risk | Action |
|----------|----------|----------|----------------|------|--------|
| 1 | ... | ... | ... | ... | ... |

Include total estimated savings across all recommendations.
