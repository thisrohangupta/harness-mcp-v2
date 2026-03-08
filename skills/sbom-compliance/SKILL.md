---
name: sbom-compliance
description: Audit SBOM and compliance posture for artifacts — license risks, policy violations, and component vulnerabilities. Use when the user needs to check software bill of materials, verify license compliance, or audit third-party component risks.
---

# SBOM Compliance Check

Audit SBOM and compliance posture for artifacts.

## When to Use

- User asks about SBOM (Software Bill of Materials)
- User wants to check license compliance
- User needs to audit third-party dependencies
- User mentions compliance, license risks, or component security

## Instructions

### Step 1 — Get SBOM data

- Call `harness_get` with `resource_type="scs_sbom"` for the full SBOM
- Call `harness_list` with `resource_type="scs_compliance_result"` for compliance scan results
- Call `harness_list` with `resource_type="scs_artifact_component"` for component inventory
- Call `harness_get` with `resource_type="scs_artifact_remediation"` for remediation guidance

### Step 2 — Check policies

- Call `harness_create` with `resource_type="scs_opa_policy"` to review OPA policies (or list existing ones)
- Cross-reference components against compliance policies

### Step 3 — Analyze findings

Produce a compliance report:
- **Component count**: Total direct and transitive dependencies
- **License breakdown**: Count by license type (MIT, Apache, GPL, LGPL, proprietary, unknown)
- **License risks**: Any copyleft or restrictive licenses that conflict with project requirements
- **Policy violations**: Components that violate OPA policies
- **Vulnerable components**: Dependencies with known CVEs

### Step 4 — Remediation plan

For each issue:
1. What the issue is
2. Which component is affected
3. Recommended fix (upgrade, replace, or request exemption)
4. Effort estimate (easy/medium/hard)

### Step 5 — Summary

Provide an overall compliance health score and the top actions to improve compliance posture.
