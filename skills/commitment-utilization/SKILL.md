---
name: commitment-utilization
description: Analyze reserved instance and savings plan utilization to find waste and optimize cloud commitments. Use when the user wants to review RI coverage, check savings plan utilization, or optimize their cloud commitment strategy.
---

# Commitment Utilization Review

Analyze reserved instance and savings plan utilization.

## When to Use

- User asks about reserved instance utilization or coverage
- User wants to optimize savings plans
- User mentions RI waste, commitment coverage, or savings plan efficiency
- User wants to plan commitment purchases

## Instructions

### Step 1 — Gather commitment data

- Call `harness_get` with `resource_type="cost_commitment_coverage"` for coverage analysis
- Call `harness_get` with `resource_type="cost_commitment_utilisation"` for utilization rates
- Call `harness_get` with `resource_type="cost_commitment_savings"` for realized savings
- Call `harness_get` with `resource_type="cost_commitment_analysis"` for commitment analysis
- Call `harness_get` with `resource_type="cost_estimated_savings"` for projected savings opportunities

### Step 2 — Assess current state

Present key metrics:
- **Utilization rate**: What percentage of commitments are being used
- **Coverage rate**: What percentage of eligible usage is covered by commitments
- **Wasted spend**: Dollar amount of unused commitments
- **Realized savings**: How much the commitments have saved vs. on-demand

### Step 3 — Identify issues

Flag:
- Under-utilized commitments (paying for unused capacity)
- Under-covered workloads (on-demand spend that could be committed)
- Expiring commitments that need renewal decisions
- Mismatched commitment types (wrong instance family or region)

### Step 4 — Recommendations

Provide specific recommendations:
- Which commitments to right-size or exchange
- New commitments to purchase (with estimated savings)
- Commitment type changes (RI to Savings Plans or vice versa)
- Upcoming expirations and renewal strategy
