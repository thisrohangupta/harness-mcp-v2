---
name: chaos-resilience
description: Design and run a chaos engineering experiment to test service resilience in Harness. Use when the user wants to test fault tolerance, run chaos experiments, or validate that services handle failures gracefully. Reviews existing infrastructure, templates, and probes to design targeted experiments.
---

# Chaos Resilience Test

Design and run a chaos experiment to test service resilience.

## When to Use

- User wants to test service resilience or fault tolerance
- User mentions chaos engineering, fault injection, or reliability testing
- User wants to validate that a service handles failures gracefully
- User wants to run a chaos experiment in Harness

## Instructions

### Step 1 — Survey chaos infrastructure

- Call `harness_list` with `resource_type="chaos_infrastructure"` to see available chaos targets
- Call `harness_list` with `resource_type="chaos_experiment_template"` to see reusable experiment templates
- Call `harness_list` with `resource_type="chaos_probe"` to see available probes (health checks, HTTP endpoints, etc.)
- Call `harness_list` with `resource_type="chaos_experiment"` to review past experiments and their results

### Step 2 — Design the experiment

Based on the service to test and available infrastructure, design an experiment that includes:
- **Fault type**: What failure to inject (pod kill, network latency, CPU stress, memory hog, disk fill, etc.)
- **Blast radius**: Which pods/nodes/namespaces are targeted
- **Probes**: What to monitor during the experiment (HTTP health checks, custom scripts, Prometheus queries)
- **Duration**: How long to run the fault
- **Steady state hypothesis**: What "normal" looks like and what we expect during chaos
- **Abort conditions**: When to automatically stop the experiment

### Step 3 — Present for review

Present the complete experiment design with:
- Experiment configuration
- Expected behavior during fault injection
- Recovery expectations
- Risk assessment

Do NOT execute the experiment until the user explicitly confirms.

### Step 4 — Execute and monitor

After confirmation:
- Create the experiment using `harness_create` or use `harness_execute` with `resource_type="chaos_experiment"` and `action="run"`
- Monitor the experiment run using `harness_get` with `resource_type="chaos_experiment_run"`
- Report probe results, resilience score, and any unexpected behaviors

### Step 5 — Analyze results

Provide a resilience report:
- Did the service survive the fault?
- Were probes healthy during the experiment?
- How quickly did the service recover?
- Recommendations for improving resilience
