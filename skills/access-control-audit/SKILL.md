---
name: access-control-audit
description: Audit user permissions, over-privileged accounts, and role assignments to enforce least-privilege in Harness. Use when the user wants to review who has access to what, find over-privileged accounts, or clean up stale permissions.
---

# Access Control Audit

Audit permissions and enforce least-privilege.

## When to Use

- User wants to review access control and permissions
- User asks about over-privileged accounts or role assignments
- User wants to enforce least-privilege principle
- User needs a permission audit for compliance
- User mentions RBAC, access review, or permission cleanup

## Instructions

### Step 1 — Gather access data

- Call `harness_list` with `resource_type="user"` to list all users
- Call `harness_list` with `resource_type="service_account"` to list service accounts
- Call `harness_list` with `resource_type="role"` to list defined roles
- Call `harness_list` with `resource_type="role_assignment"` to see who has what roles
- Call `harness_list` with `resource_type="resource_group"` to see resource scoping
- Call `harness_list` with `resource_type="user_group"` to see group memberships

### Step 2 — Identify risks

Flag:
- **Over-privileged accounts**: Users or service accounts with admin/broad roles they don't need
- **Stale accounts**: Users who haven't been active recently but still have access
- **Permission sprawl**: Users with roles in many projects they may not actively use
- **Drift**: Role assignments that don't match the expected baseline
- **Broad scopes**: Roles assigned at account level that should be project-scoped

### Step 3 — Produce audit report

Structure as:

1. **Summary**: Total users, service accounts, roles, and role assignments
2. **Over-privileged accounts**: List with current roles and recommended reduction
3. **Stale accounts**: Inactive users with access
4. **Broad scope issues**: Account-level roles that should be narrowed
5. **Service account review**: Service accounts with excessive permissions

### Step 4 — Recommendations

For each finding:
- Current state and the specific risk
- Recommended change (role reduction, scope narrowing, account deactivation)
- Impact of making the change
- Priority (immediate, scheduled, low)

### Step 5 — Compliance summary

If relevant, map findings to compliance frameworks (SOC 2, ISO 27001, HIPAA) and note which controls are satisfied or at risk.
