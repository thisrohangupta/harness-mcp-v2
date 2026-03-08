---
name: feature-flag-rollout
description: Plan and execute a progressive feature flag rollout across environments in Harness. Use when the user wants to roll out a feature flag safely, manage a phased release, or set up percentage-based targeting. Assesses current flag state and proposes a rollout plan with safety gates.
---

# Feature Flag Rollout

Plan and execute a progressive feature flag rollout.

## When to Use

- User wants to roll out a feature flag across environments
- User mentions progressive delivery, percentage rollout, or phased release
- User wants to safely enable a feature for a subset of users
- User asks about feature flag management

## Instructions

### Step 1 — Get flag details

Call `harness_get` with `resource_type="feature_flag"` and the flag identifier to retrieve:
- Current state (on/off) per environment
- Targeting rules
- Default serve values
- Variations defined

### Step 2 — Survey environments

- Call `harness_list` with `resource_type="environment"` to see all available environments
- If using FME (Split.io): call `harness_list` with `resource_type="fme_workspace"` and `resource_type="fme_environment"`

### Step 3 — Assess current state

Document:
- Which environments the flag is currently enabled in
- Current targeting rules and percentage rollouts
- Any prerequisites or dependent flags

### Step 4 — Propose rollout plan

Design a progressive rollout:
1. **Dev** — Enable 100% immediately
2. **Staging** — Enable 100% for validation
3. **Production — Phase 1** — Enable for 5-10% of users
4. **Production — Phase 2** — Increase to 25% after monitoring period
5. **Production — Phase 3** — Increase to 50%
6. **Production — Full** — Enable 100%

For each phase, define:
- Target percentage or user segments
- Monitoring period before advancing
- Success criteria (error rates, latency, business metrics)
- Rollback trigger conditions

### Step 5 — Execute (with confirmation)

After user approves the plan:
- Use `harness_execute` with `resource_type="feature_flag"` and `action="toggle"` for each phase
- Wait for user confirmation between production phases
- Monitor for issues before advancing

### Step 6 — Rollback plan

Document the emergency rollback procedure:
- How to immediately disable the flag in all environments
- Which `harness_execute` call to make for instant rollback
- Who to notify if rollback is needed
