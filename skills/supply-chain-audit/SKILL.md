---
name: supply-chain-audit
description: End-to-end software supply chain security audit — provenance, chain of custody, SBOM coverage, and policy compliance. Use when the user wants a comprehensive supply chain security assessment, needs to verify artifact provenance, or wants to ensure chain of custody integrity.
---

# Supply Chain Audit

End-to-end software supply chain security audit.

## When to Use

- User wants a supply chain security assessment
- User asks about artifact provenance or chain of custody
- User needs to verify supply chain integrity
- User mentions SLSA, supply chain, or software provenance

## Instructions

### Step 1 — Gather supply chain data

- Call `harness_list` with `resource_type="artifact_security"` for artifact security posture
- Call `harness_list` with `resource_type="code_repo_security"` for source code security
- Call `harness_get` with `resource_type="scs_chain_of_custody"` for chain of custody records
- Call `harness_get` with `resource_type="scs_sbom"` for SBOM coverage
- Call `harness_list` with `resource_type="scs_compliance_result"` for policy compliance
- Call `harness_get` with `resource_type="scs_artifact_remediation"` for remediation guidance

### Step 2 — Assess supply chain integrity

Evaluate:
- **Provenance**: Can every artifact be traced back to its source code and build pipeline?
- **Chain of custody**: Are there gaps in the chain from source to deployment?
- **SBOM coverage**: Do all artifacts have complete SBOMs?
- **Signing**: Are artifacts and attestations cryptographically signed?
- **Policy compliance**: Do artifacts meet all OPA policy requirements?

### Step 3 — Produce audit report

Structure the report as:
1. **Integrity score** — overall supply chain health (0-100)
2. **Provenance gaps** — artifacts without clear lineage
3. **SBOM coverage** — percentage of artifacts with complete SBOMs
4. **Policy violations** — non-compliant artifacts or builds
5. **Chain of custody issues** — breaks in the custody chain

### Step 4 — Recommendations

Prioritized recommendations:
- Critical gaps to close immediately
- Process improvements for better provenance
- Tooling recommendations (signing, attestation, SBOM generation)
- Policy additions to prevent future gaps
