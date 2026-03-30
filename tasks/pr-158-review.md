# PR #158 Architecture Review

**PR**: feat(scs): P3-10 OPA policy cross-references + P3-8 dependency descriptions
**Branch**: `SSCA-6036` → `main`
**Author**: mohit-agarwal-harness
**Files changed**: 6 (+508 / -13)

---

## Summary

This PR adds cross-toolset metadata to enable LLM routing between the **SCS** (Software Supply Chain) and **governance** toolsets. The changes are purely declarative — resource descriptions, `searchAliases`, and `relatedResources` — with no functional code changes. It also marks the legacy `scs_artifact_remediation` resource as deprecated in favor of `scs_component_remediation`, and fixes E2E smoke test queries that referenced components not present in the QA environment.

---

## Architecture Conformance: PASS

The changes correctly follow the project's MCP architecture patterns:

### 1. Metadata-only approach (correct)
All changes use the established `ResourceDefinition` metadata fields (`description`, `searchAliases`, `relatedResources`) rather than adding code-level routing logic. This aligns with the architecture's "prefer data over prose" principle and the anti-bloat rule of putting guidance into structured metadata on resource definitions rather than server instructions.

### 2. Cross-toolset references via `relatedResources` (correct pattern)
The `relatedResources` field stores `resourceType: string` references — purely documentary graph hints for LLM navigation. The governance resources (`policy`, `policy_set`) reference SCS resources (`scs_compliance_result`) as siblings, and vice versa. This is the correct mechanism per the architecture's guidance table: "Resource-specific operation details → `description` on the `EndpointSpec`."

### 3. Search routing via `searchAliases` (correct mechanism)
`searchAliases` on `policy` (e.g., "deny list", "sbom policy", "supply chain policy") and `policy_set` (e.g., "sbom enforcement", "supply chain enforcement") feed into `Registry.searchResources()` which scores exact alias matches at 95 and partial matches at 90. This enables LLM queries like "SBOM enforcement rules" to correctly route to the governance toolset's `policy_set` resource.

### 4. Legacy deprecation pattern (clean)
Marking `scs_artifact_remediation` as "(Legacy)" in `displayName` and prepending "PREFER scs_component_remediation" to the description is an effective pattern. The LLM will still find it via search, but the description provides clear redirection guidance. The `scs_artifact_component` resource's `relatedResources` was also updated to point to the preferred resource.

### 5. Test coverage (thorough)
- New `tests/registry/governance.test.ts` (221 lines) validates all P3-10 metadata on governance resources
- Extended `tests/registry/scs.test.ts` (+113 lines) validates cross-references on `scs_compliance_result` and `scs_component_dependencies`
- Extended `tests/tools/scs-wave2-verification.test.ts` (+107 lines) tests actual `Registry.searchResources()` routing for cross-toolset queries
- Updated `tests/e2e/scs_llm_smoke_test.py` adds Q32, Q33, M09 for OPA policy queries and fixes environment-specific test data

---

## Detailed File Review

### `src/registry/toolsets/governance.ts` (+18 / -2)

**Changes**: Enhanced `policy` and `policy_set` resource definitions with:
- SCS/SBOM-specific descriptions mentioning deny-lists, allow-lists, Rego, enforcement
- `searchAliases` arrays with SCS-relevant terms
- `relatedResources` cross-referencing `scs_compliance_result`, `policy_evaluation`, and each other

**Assessment**: Clean and minimal. The relationship semantics are internally consistent:
- `policy` → `policy_set` as `"parent"` (policies belong to policy sets)
- `policy_set` → `policy` as `"child"` (policy sets contain policies)
- Both → `scs_compliance_result` as `"sibling"` (compliance results show enforcement outcomes)

### `src/registry/toolsets/scs.ts` (+7 / -4)

**Changes**:
1. `scs_artifact_component`: Updated `relatedResources` to point to `scs_component_remediation` (preferred) instead of `scs_artifact_remediation` (legacy)
2. `scs_artifact_remediation`: Marked as "(Legacy)" with explicit "PREFER scs_component_remediation" guidance
3. `scs_compliance_result`: Added enforcement-related `searchAliases` and `relatedResources` cross-referencing `policy` and `policy_set`

**Assessment**: Minimal, targeted changes. The legacy deprecation pattern is clear and doesn't break existing functionality.

### `tests/registry/governance.test.ts` (new, +221)

**Assessment**: Well-structured tests covering:
- Resource existence and description content
- `searchAliases` presence and specific terms
- `relatedResources` cross-references with correct relationship types
- CRUD operation structural validation (method, path)
- Uses same `findResource`/`getOp` helper pattern as existing SCS tests

### `tests/registry/scs.test.ts` (+113)

**Assessment**: Adds P3-10 cross-reference validation and P3-8 dependency tree structural tests. Tests are property-based (checking specific attributes) rather than snapshot-based, which is resilient to unrelated changes.

### `tests/tools/scs-wave2-verification.test.ts` (+107 / -2)

**Assessment**: Key additions:
- `CROSS_TOOLSET_TYPES` set to allow governance types in `relatedResources` validation (necessary fix for the cross-toolset pattern)
- `Registry.searchResources()` routing tests proving SCS-context queries ("deny list policy", "sbom enforcement") surface governance resources
- Dependency tree search routing tests

### `tests/e2e/scs_llm_smoke_test.py` (+42 / -5)

**Assessment**: Test data fixes (express → zlib for Alpine environment) and query disambiguation improvements (more explicit phrasing for M06 T3). New Q32, Q33, M09 test cases for OPA policy routing.

---

## Observations and Considerations

### 1. Cross-toolset references with selective toolset loading
When `HARNESS_TOOLSETS` is set to only `scs` (without `governance`), `relatedResources` entries pointing to `policy` and `policy_set` will reference types that don't exist in the registry. Since `relatedResources` are purely documentary (surfaced in `describe()` output but not resolved at runtime), this won't cause errors. However, it could confuse an LLM that sees references to non-existent types. This is an acceptable trade-off for the cross-toolset routing benefit, but worth documenting if not already noted.

### 2. `scs_artifact_component` still references legacy `scs_artifact_remediation`
Looking at line 181 of scs.ts on the PR branch, `scs_artifact_component` now points to `scs_component_remediation` (the preferred resource). However, the `artifact_security` resource still references `scs_artifact_remediation` as a child (line 121). While this is correct (both resources exist), it might be worth eventually updating `artifact_security` to also prefer `scs_component_remediation` in a follow-up.

### 3. Relationship type on `policy` → `policy_set`
The `policy` resource marks `policy_set` as `relationship: "parent"`. In Harness, policies can exist independently of policy sets — the relationship is more "contained by / grouped into" than strict parentage. This is a reasonable simplification for LLM guidance but could be confusing if taken literally.

---

## Verdict

**Approve** — This is a clean, well-scoped metadata-only PR that correctly uses the MCP architecture's declarative metadata patterns (`searchAliases`, `relatedResources`, resource descriptions) to improve LLM routing between the SCS and governance toolsets. No functional code is changed. Test coverage is thorough with 3 test files covering unit, structural, and search-routing validation. The changes follow existing patterns and conventions consistently.

The smoke test improvements (Q32, Q33, M09 for OPA policy routing + environment-specific data fixes) demonstrate measurable improvement in LLM tool selection accuracy.
