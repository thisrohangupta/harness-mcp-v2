---
name: dora-metrics
description: Review DORA metrics for a team or project — deployment frequency, change failure rate, MTTR, and lead time for changes. Use when the user wants to assess engineering performance, DevOps maturity, or understand delivery velocity. Classifies performance as Elite/High/Medium/Low and suggests improvements.
---

# DORA Metrics Review

Review DORA metrics and assess engineering team performance.

## When to Use

- User asks about DORA metrics, deployment frequency, or engineering performance
- User wants to assess DevOps maturity
- User mentions change failure rate, MTTR, or lead time
- User wants to improve delivery velocity

## Instructions

### Step 1 — Fetch all four DORA metrics

Use `harness_get` to retrieve each DORA metric:
- `resource_type="sei_deployment_frequency"` — How often code deploys to production
- `resource_type="sei_change_failure_rate"` — Percentage of deployments causing failures
- `resource_type="sei_mttr"` — Mean time to recover from failures
- `resource_type="sei_lead_time"` — Time from commit to production

If a team ID is provided, scope the queries to that team.

### Step 2 — Classify performance

For each metric, classify against the DORA benchmarks:

| Metric | Elite | High | Medium | Low |
|--------|-------|------|--------|-----|
| Deployment Frequency | On-demand (multiple/day) | Daily to weekly | Weekly to monthly | Monthly+ |
| Change Failure Rate | < 5% | 5-10% | 10-15% | > 15% |
| MTTR | < 1 hour | < 1 day | < 1 week | > 1 week |
| Lead Time | < 1 day | 1 day - 1 week | 1 week - 1 month | > 1 month |

### Step 3 — Build the scorecard

Present a DORA scorecard table showing:
- Each metric's current value
- Classification (Elite/High/Medium/Low)
- Trend direction (improving/declining/stable)

### Step 4 — Identify weakest area

Highlight the weakest metric and provide specific, actionable recommendations:
- For low deployment frequency: suggest pipeline automation, trunk-based development
- For high change failure rate: suggest better testing, canary deployments, feature flags
- For slow MTTR: suggest better observability, automated rollbacks, incident runbooks
- For long lead time: suggest smaller PRs, reduced approval bottlenecks, CI optimization

### Step 5 — Drill down (optional)

If the user wants details, use the drilldown resources:
- `resource_type="sei_deployment_frequency_drilldown"` for per-pipeline breakdown
- `resource_type="sei_change_failure_rate_drilldown"` for failure analysis
