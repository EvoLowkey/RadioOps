# RadioOps Employee Signup and Approval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add self-service employee registration, manager approval controls, account-state gates, and a simplified employee radio workspace to the existing production RadioOps app.

**Architecture:** Supabase Auth creates users; an `auth.users` trigger creates a forced EMPLOYEE/PENDING profile. SECURITY DEFINER RPCs perform manager-only approval state transitions. The browser renders one of four account gates (pending/rejected/disabled/active), with role-specific active workspaces and no privileged key.

**Tech Stack:** HTML5, CSS3, JavaScript ES modules, Supabase Auth/PostgreSQL/RLS/RPC, Node.js built-in test runner, Vercel.

**Spec:** `docs/superpowers/specs/2026-08-23-radioops-employee-signup-approval-design.md`

## Global Constraints
- Any email address may register.
- Self-registration always creates role `EMPLOYEE`, approval status `PENDING`, and inactive operational access.
- Only an active Manager may approve, reject, disable, or enable another employee.
- Active Employee UI exposes only self-service checkout/return, own recent history, available count, and connection status.
- Pending, rejected, and disabled accounts cannot read fleet data or call operational RPCs.
- Existing active production users migrate to `ACTIVE` without breaking the current Manager account.
- No service-role or secret Supabase key may be exposed to the browser.

---

### Task 1: Approval-aware database migration
**Files:**
- Create: `supabase/migrations/202608230002_employee_signup_approval.sql`
- Test: `tests/employee-migration.test.js`

**Interfaces:**
- Produces profile columns `email`, `approval_status`, approval timestamps, signup trigger, active-aware helper functions, and RPCs `approve_employee`, `reject_employee`, `disable_employee`, `enable_employee`.

- [ ] Write migration contract tests for schema fields, signup trigger safeguards, active-aware helpers, RPC names, and grants.
- [ ] Run tests and verify the new migration contract fails because the file does not exist.
- [ ] Implement an idempotent migration that preserves existing users, forces new signups to EMPLOYEE/PENDING, updates RLS/helper functions, and adds manager-only transition RPCs with audit events.
- [ ] Run the migration contract tests and full suite.

### Task 2: Browser API and approval helpers
**Files:**
- Modify: `src/api.js`
- Modify: `src/permissions.js`
- Modify: `src/view-models.js`
- Test: `tests/employee-api.test.js`
- Test: `tests/employee-permissions.test.js`

**Interfaces:**
- Produces `signUpEmployee`, `approveEmployee`, `rejectEmployee`, `disableEmployee`, `enableEmployee`, approval-aware `isActive`, `isManager`, `getAccountGate`, and employee directory summaries.

- [ ] Write API contract tests for signup metadata and manager RPC payloads.
- [ ] Verify tests fail against the old API.
- [ ] Implement signup/manager methods and profile listing fields.
- [ ] Write and run approval-state permission tests.
- [ ] Implement approval-aware helpers and employee summary view-models.
- [ ] Run all tests.

### Task 3: Registration and account-state gates
**Files:**
- Modify: `index.html`
- Modify: `styles.css`
- Modify: `src/app.js`
- Test: `tests/employee-ui-structure.test.js`

**Interfaces:**
- Consumes `signUpEmployee`, `getAccountGate`.
- Produces Sign In/Create Account tabs, registration form, pending/rejected/disabled full-page gates, refresh status, and sign out.

- [ ] Write DOM structure tests for registration and account-state gate IDs.
- [ ] Verify tests fail.
- [ ] Add registration and status-gate markup/styles.
- [ ] Wire registration validation and Supabase Auth signup metadata.
- [ ] Change bootstrap/session logic so non-active profiles render account gates without attempting fleet queries.
- [ ] Run tests and syntax checks.

### Task 4: Manager Employees administration
**Files:**
- Modify: `index.html`
- Modify: `styles.css`
- Modify: `src/app.js`
- Test: `tests/employees-view-model.test.js`

**Interfaces:**
- Consumes all-profile listing and employee status RPCs.
- Produces Manager-only Employees navigation, summary cards, Pending/Active/Disabled-Rejected filters, approve/reject/disable/enable controls, current-radio display, and history navigation.

- [ ] Write summary/filter/current-radio tests.
- [ ] Verify tests fail.
- [ ] Add Employees view markup and manager-only navigation.
- [ ] Implement summary/list rendering and confirmation-backed mutations.
- [ ] Subscribe Manager sessions to profile changes and refresh the directory.
- [ ] Run tests and syntax checks.

### Task 5: Simplified Employee workspace
**Files:**
- Modify: `index.html`
- Modify: `styles.css`
- Modify: `src/app.js`
- Test: `tests/employee-workspace.test.js`

**Interfaces:**
- Consumes the authenticated employee's own profile/assignments and radio availability.
- Produces My Radio card, Scan/Select checkout, Return My Radio, available count, five recent assignments, and hides Manager/fleet administration surfaces.

- [ ] Write employee workspace helper/DOM tests.
- [ ] Verify tests fail.
- [ ] Render a dedicated employee home view and restrict visible navigation to Home and Sign out.
- [ ] Reuse scanner and checkout/return RPCs with the authenticated profile only.
- [ ] Verify employees cannot initiate a second checkout in UI.
- [ ] Run full tests and syntax checks.

### Task 6: Deployment documentation and package
**Files:**
- Modify: `README.md`
- Preserve: `vercel.json`, `api/runtime-config.js`

**Interfaces:**
- Produces exact Supabase migration/deployment steps and employee rollout instructions.

- [ ] Document running migration `202608230002_employee_signup_approval.sql` in Supabase SQL Editor.
- [ ] Document Supabase email confirmation setting and Manager approval workflow.
- [ ] Verify `/api/runtime-config` remains the production runtime source in `index.html`.
- [ ] Run `npm test`, `node --check src/app.js`, and secret-pattern scans.
- [ ] Create a clean ZIP for GitHub/Vercel update delivery.
