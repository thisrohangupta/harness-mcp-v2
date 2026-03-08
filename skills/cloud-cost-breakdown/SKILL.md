---
name: cloud-cost-breakdown
description: Deep-dive into cloud costs by service, environment, or cluster with trend analysis and anomaly detection. Use when the user wants to understand where cloud money is going, analyze cost trends, or investigate a cost spike. Provides breakdowns by dimension and identifies top cost drivers.
---

# Cloud Cost Breakdown

Deep-dive into cloud costs with trend analysis.

## When to Use

- User asks "where is my cloud money going"
- User wants a cost breakdown by service, team, or environment
- User wants to understand cost trends over time
- User is investigating a cost spike

## Instructions

### Step 1 — Get perspectives

Call `harness_list` with `resource_type="cost_perspective"` to see available cost perspectives (views). If the user specifies a perspective, use it; otherwise default to the most relevant one.

### Step 2 — Get cost data

- Call `harness_get` with `resource_type="cost_summary"` to get the aggregate cost summary
- Call `harness_list` with `resource_type="cost_breakdown"` to get costs broken down by dimension (service, environment, cluster, cloud provider, etc.)
- Call `harness_list` with `resource_type="cost_timeseries"` to get cost trends over time

### Step 3 — Check for anomalies

Call `harness_list` with `resource_type="cost_anomaly"` to find any spending anomalies in the period.

### Step 4 — Analyze and present

Provide:
1. **Top 5 cost drivers** — which services/resources cost the most
2. **Trend analysis** — is spending going up, down, or flat? Week-over-week and month-over-month
3. **Anomalies** — any unexpected spikes with root cause analysis
4. **Optimization ideas** — based on the breakdown, where are the easiest savings
5. **Forecast** — projected costs for the next billing period at current run rate

### Step 5 — Drill down (optional)

If the user wants more detail on a specific cost driver:
- Call `harness_get` with `resource_type="cost_overview"` for detailed cost metrics
- Call `harness_list` with `resource_type="cost_filter_value"` to explore available filter dimensions
