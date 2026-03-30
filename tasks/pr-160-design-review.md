# PR #160 Design Standards Review

## PR: feat: [CDS-119474]: Add GitOps write tools — create/update apps, bulk refresh/sync, cancel operation, resource actions, cluster-environment linking

**Scope**: Single file change — `src/registry/toolsets/gitops.ts` (+391 lines, -1 line)

---

## Executive Summary

The PR adds 7 new operations to the GitOps toolset: application create/update, bulk refresh, bulk sync, cancel operation, run resource action, and a new `gitops_cluster_link` resource type. The design is **generally well-aligned** with the project's MCP standards. The code follows the established registry pattern, uses appropriate response extractors, and provides good LLM-facing documentation through `description`, `bodySchema`, and `actionDescription` fields.

There are **2 bugs** (one code, one documentation), **2 important design concerns**, and **5 minor improvements** worth addressing.

---

## Critical Issues (Should Fix Before Merge)

### 1. BUG: `bulk_sync` missing `revision` handling

The PR description explicitly promises `body.revision` support:

> `body.revision` — override target revision for the sync

But the `bodyBuilder` for `bulk_sync` does **not** handle `body.revision`:

```typescript
// Current code — no revision handling
const result: Record<string, unknown> = { applicationTargets: targets };
if (body.dryRun !== undefined) result.dryRun = body.dryRun;
if (body.prune !== undefined) result.prune = body.prune;
if (body.strategy) result.strategy = body.strategy;
if (body.retryStrategy) result.retryStrategy = body.retryStrategy;
if (body.syncOptions) { /* ... */ }
// ← body.revision is silently dropped
```

The `bodySchema.fields` array also omits `revision`. This means an LLM passing `body.revision` based on the PR description or ArgoCD docs would get silently ignored.

**Fix**: Add `if (body.revision) result.revision = body.revision;` to the bodyBuilder and add `{ name: "revision", type: "string", required: false, description: "Override target revision for the sync." }` to the bodySchema fields.

### 2. DOC/CODE MISMATCH: `cancel_operation` HTTP method

The PR description states:
> **API**: `POST /gitops/api/v1/agents/{agentIdentifier}/applications/{appName}/operation`

But the code uses:
```typescript
method: "DELETE",
```

The ArgoCD `OperationTerminateRequest` proto maps to a `DELETE` endpoint, so **the code is correct and the PR description is wrong**. No code change needed, but the PR body should be corrected to avoid reviewer confusion.

---

## Important Design Concerns (Should Consider)

### 3. Missing `injectAccountInBody` on create/update operations

All existing GitOps POST endpoints in this file that hit gRPC-gateway APIs (`/gitops/api/v1/...`) use `injectAccountInBody: true`:

```typescript
// Existing pattern for GitOps list POST endpoints:
list: {
  method: "POST",
  path: "/gitops/api/v1/applications",
  injectAccountInBody: true,  // ← Required for gRPC-gateway
  bodyBuilder: (input) => gitopsListBody(input, { metadataOnly: true }),
```

The new `create` and `update` operations also POST/PUT to the same gRPC-gateway prefix (`/gitops/api/v1/agents/...`) but **do not set `injectAccountInBody: true`**:

```typescript
create: {
  method: "POST",
  path: "/gitops/api/v1/agents/{agentIdentifier}/applications",
  // ← No injectAccountInBody
```

The `types.ts` documentation explicitly states:

> When true, inject `accountIdentifier` from config into the POST/PUT request body. Required for gRPC-gateway APIs (e.g. GitOps) where `body: "*"` means the entire JSON body IS the proto message — query-param-only accountIdentifier is invisible to the handler.

If the application create/update endpoints follow the same gRPC-gateway pattern, the `accountIdentifier` will be missing from the body and potentially cause silent scope misassignment. **Verify whether these endpoints require `injectAccountInBody` through testing or API docs.**

This also applies to the `refresh` and `bulk_sync` execute actions, which POST to `/gitops/api/v1/applications/bulk/...`.

### 4. Inconsistent `refresh` parameter sourcing

The `refresh` execute action reads from two different input sources:

```typescript
refresh: body.refresh ?? input.refresh ?? "normal",
```

The `body.refresh` path is the standard pattern (user passes `body={refresh:'hard'}`). But `input.refresh` means the value could come from `params={refresh:'hard'}` since `params` are merged into `input` at the tool level. No other bodyBuilder in the codebase reads from `input` directly for action-specific fields — they consistently read from `body`.

**Recommendation**: Remove `input.refresh` and stick to `body.refresh ?? "normal"` for consistency. Update the `actionDescription` examples to only show the `body` path.

---

## Minor Improvements (Nice to Have)

### 5. Missing `deepLinkTemplate` on `gitops_cluster_link`

Every other GitOps resource defines a `deepLinkTemplate` for generating Harness UI links in responses. The new `gitops_cluster_link` resource omits it:

```typescript
{
  resourceType: "gitops_cluster_link",
  displayName: "GitOps Cluster-Environment Link",
  // ← No deepLinkTemplate
```

This means responses won't include an `openInHarness` URL. If the Harness UI has a page for cluster-environment mappings, a template should be added.

### 6. Missing `relatedResources` for cross-type navigation

The `gitops_cluster_link` resource is a junction between `gitops_cluster` and `environment`. Adding `relatedResources` would help LLMs understand the relationship graph:

```typescript
relatedResources: [
  { resourceType: "gitops_cluster", relationship: "linked_cluster", description: "The GitOps cluster being linked" },
  { resourceType: "environment", relationship: "target_environment", description: "The Harness environment being linked to" },
],
```

### 7. Missing `diagnosticHint` on `gitops_cluster_link`

Other resources provide troubleshooting guidance via `diagnosticHint`. The cluster link resource could benefit from:

```typescript
diagnosticHint: "If create fails with a scope error, verify that the cluster scope is equal to or wider than the environment scope. Use harness_list(resource_type='gitops_cluster') to check available clusters and their scopes.",
```

### 8. `run_resource_action`: `group` field probably should be required

The `bodySchema` marks `group` as `required: false`, but the `description` says "Required for most resource kinds." The bodyBuilder validation also skips it:

```typescript
if (!action || !kind || !resourceName || !namespace) {
  throw new Error(/* ... */);
}
// group is not validated
```

For standard K8s resources like Deployments (`apps`), StatefulSets (`apps`), Rollouts (`argoproj.io`), the `group` is always needed. Only core `v1` resources like Services omit it. Making `group` required in the schema and validation would prevent API failures in the vast majority of use cases.

### 9. Long descriptions could leverage `executeHint` more

The `run_resource_action` description includes a 3-step workflow that would be better placed as an `executeHint` on the `gitops_application` resource definition. This follows the CLAUDE.md guidance:

> | Execute action usage | `actionDescription` + `executeHint` on the resource |

Currently `gitops_application` has a `diagnosticHint` but no `executeHint`. Adding one for the resource action workflow would centralize this guidance and be surfaced automatically via `harness_describe`.

---

## What Passes Standards Well

### Correct Extractor Usage
- `passthrough` for all GitOps gRPC-gateway endpoints — consistent with existing patterns
- `ngExtract` for `gitops_cluster_link` create (NG API `POST /ng/api/gitops/clusters` returns `{ status, data }`)
- `pageExtract` for `gitops_cluster_link` list (NG API returns `{ data: { content, totalElements } }`)

### Clean Tool Registration Pattern
- `create`/`update` correctly placed under `operations` (dispatched via `harness_create`/`harness_update`)
- `refresh`/`bulk_sync`/`cancel_operation`/`run_resource_action` correctly placed under `executeActions` (dispatched via `harness_execute`)

### Proper `bodySchema` Definitions
- All write operations define `bodySchema` with typed `fields` — enables `harness_describe` and `harness_schema` to surface them
- Required fields are properly marked, enabling the registry's automatic validation

### Good Error Messages
- Every `bodyBuilder` validates required fields and throws descriptive errors with usage examples
- `buildBulkTargets` provides clear guidance when no valid targets are found

### No Server Instructions Bloat
- All guidance is in tool-level `description`, `actionDescription`, and `bodySchema` — nothing added to `instructions` in `src/index.ts`

### Consistent Naming
- snake_case for actions (`cancel_operation`, `run_resource_action`, `bulk_sync`)
- Verb-prefixed action names follow the dispatch convention

### Smart Shared Helper
- `buildBulkTargets` is well-factored, shared across `refresh`, `bulk_sync`, and conceptually reusable
- Supports both single-app (via `resource_id` + params) and multi-app (via `body.targets`) patterns

### Security
- No secret exposure risk — deals with GitOps applications, clusters, and K8s resources
- Destructive operations go through `confirmViaElicitation` at the tool level

### Resource ID Mapping Documented
- The PR correctly documents the `resource_id` asymmetry between `harness_get` (maps to last identifier field) and `harness_execute` (maps to first identifier field)
- This is a known framework behavior, and the descriptions warn LLMs about it

---

## Verification Checklist

| Check | Status | Notes |
|-------|--------|-------|
| Single-file change, no breaking changes | ✅ | Only adds new operations/resources |
| Uses correct extractors for API type | ✅ | passthrough for GitOps, ngExtract/pageExtract for NG |
| bodySchema matches bodyBuilder output | ⚠️ | Missing `revision` field in bulk_sync |
| No console.log (stdout corruption) | ✅ | No logging added |
| No server instructions bloat | ✅ | All docs in tool-level fields |
| Descriptions include concrete examples | ✅ | Every operation has usage examples |
| pathParams/queryParams properly mapped | ✅ | Consistent with existing patterns |
| Scope handling correct | ✅ | cluster_link uses NG scoping; app operations use GitOps scoping |
| Safety gates (confirmation) | ✅ | Handled at tool registration level |
| Type consistency | ✅ | All types from `../types.js` |

---

## Recommendation

**Approve with requested changes**: Fix the `bulk_sync` revision bug and verify the `injectAccountInBody` question. The rest of the PR is well-designed and follows project standards. The minor improvements can be addressed in a follow-up.
