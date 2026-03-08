---
name: developer-scorecard
description: Review Internal Developer Portal (IDP) scorecards for services and identify gaps to improve developer experience. Use when the user wants to assess service maturity, check IDP scores, or improve catalog quality. Analyzes scorecard checks, pass rates, and provides an action plan for failing checks.
---

# Developer Portal Scorecard

Review IDP scorecards and identify improvement gaps.

## When to Use

- User asks about IDP scores, service maturity, or developer portal
- User wants to improve catalog quality or developer experience
- User mentions scorecards, checks, or service standards
- User wants to see which services need attention

## Instructions

### Step 1 — Fetch scorecard data

- Call `harness_list` with `resource_type="scorecard"` to list available scorecards
- Call `harness_list` with `resource_type="scorecard_check"` to see individual checks
- Call `harness_list` with `resource_type="idp_entity"` to list catalog entities
- Call `harness_list` with `resource_type="idp_score"` to get current scores

### Step 2 — Analyze pass rates

For each scorecard:
- Calculate overall pass rate
- Identify checks with the lowest pass rates
- Note trends (improving or declining)

### Step 3 — Identify high-impact gaps

Rank failing checks by:
- **Impact**: How many services are affected
- **Effort**: How hard is the fix (documentation update vs. infrastructure change)
- **Value**: How much the score improves if fixed

### Step 4 — Create action plan

For the top 5 most impactful failing checks:
1. What the check validates
2. How many services fail it
3. Specific steps to fix it
4. Expected score improvement
5. Who should own the fix

### Step 5 — Present recommendations

Provide a prioritized list of improvements with estimated effort and impact. Focus on quick wins first — checks that many services fail but are easy to fix.
