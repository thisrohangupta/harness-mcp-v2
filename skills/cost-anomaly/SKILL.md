---
name: cost-anomaly
description: Investigate cost anomalies detected by Harness Cloud Cost Management — determine root cause, impacted resources, and remediation. Use when the user sees unexpected cost spikes, wants to investigate billing anomalies, or needs to understand sudden cost increases.
---

# Cost Anomaly Investigation

Investigate cost anomalies and determine root cause.

## When to Use

- User notices an unexpected cost spike
- User asks about billing anomalies
- User wants to investigate sudden cost increases
- Harness CCM has detected a cost anomaly

## Instructions

### Step 1 — Fetch anomalies

Call `harness_list` with `resource_type="cost_anomaly"` to get all detected anomalies. If the user specifies a time range, filter accordingly.

### Step 2 — Get context

For each significant anomaly:
- Call `harness_list` with `resource_type="cost_timeseries"` to see the cost timeline around the anomaly
- Call `harness_list` with `resource_type="cost_breakdown"` to understand which dimensions contributed to the spike
- Call `harness_list` with `resource_type="cost_ignored_anomaly"` to see if similar anomalies were previously dismissed

### Step 3 — Root cause analysis

For each anomaly, determine:
- **When**: Exact start time and duration
- **What**: Which resource, service, or cloud account is affected
- **How much**: Dollar amount above the expected baseline
- **Why**: Root cause — new deployment, auto-scaling event, misconfigured resource, data transfer spike, abandoned experiment, etc.

### Step 4 — Present findings

For each anomaly:
1. Timeline showing normal vs. anomalous spending
2. Root cause explanation
3. Impact assessment (total extra cost)
4. Remediation steps
5. Urgency level (critical/high/medium/low)

### Step 5 — Recommend actions

- Immediate actions to stop the bleeding (e.g., terminate idle resources, fix auto-scaling limits)
- Preventive measures (e.g., budget alerts, resource quotas, tagging requirements)
- Whether to acknowledge or ignore the anomaly
