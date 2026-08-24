# RadioOps Production Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade RadioOps from local browser storage to a Supabase-backed, authenticated, shared workplace application while preserving the approved professional UI.

**Architecture:** The frontend remains a static HTML/CSS/JavaScript application, but all authoritative radio, assignment, profile, and audit data moves to Supabase PostgreSQL. A small data-client boundary isolates Supabase from UI code, while PostgreSQL RLS and SECURITY DEFINER RPCs enforce employee/manager permissions and atomic checkout/return operations.

**Tech Stack:** HTML5, CSS3, JavaScript ES modules, Supabase JS v2, PostgreSQL/Supabase SQL migrations, Vercel static hosting, Node.js built-in test runner.

**Spec:** `docs/superpowers/specs/2026-08-23-radioops-production-backend-design.md`

## Global Constraints
- Preserve WT-01 through WT-40 and the approved RadioOps visual design.
- Authentication is email/password through Supabase Auth.
- Service-role credentials must never be present in frontend source.
- RLS is enabled on application tables before production use.
- Checkout and return mutations must be atomic database RPC operations.
- Employees can only issue/return radios to themselves; managers can operate on behalf of employees.
- Audit events are append-only to normal application clients.
- LocalStorage is used only for non-sensitive UI preferences.
- QR values remain exactly WT-01 through WT-40.

---

### Task 1: Frontend production configuration and pure permission helpers
**Files:** Create `src/config.js`, `src/permissions.js`; test `tests/production-helpers.test.js`.
**Interfaces:** `getRuntimeConfig()`, `isManager(profile)`, `canManageRadio(profile)`, `effectiveRadioStatus(radio, now)`.
- [ ] Write failing tests for config validation, role helpers, and overdue calculation.
- [ ] Run tests and confirm RED.
- [ ] Implement minimum helpers.
- [ ] Run tests and confirm GREEN.

### Task 2: Supabase client/data boundary
**Files:** Create `src/supabase-client.js`, `src/api.js`; test `tests/api-contract.test.js`.
**Interfaces:** `createRadioOpsApi(client)`, `signIn`, `signOut`, `getSession`, `loadProfile`, `listRadios`, `listAssignments`, `listAuditEvents`, `checkoutRadio`, `returnRadio`, `setRepairState`, `setDockState`, `subscribeFleet`.
- [ ] Write contract tests with a fake Supabase client.
- [ ] Confirm tests fail before implementation.
- [ ] Implement API adapter and error normalization.
- [ ] Confirm tests pass.

### Task 3: Database migration, seed, RLS, and transactional RPCs
**Files:** Create `supabase/migrations/202608230001_radioops_production.sql`, `supabase/README.md`.
**Interfaces:** tables `profiles`, `radios`, `assignments`, `audit_events`; RPCs `checkout_radio`, `return_radio`, `set_radio_repair`, `set_dock_state`.
- [ ] Define schema constraints and 40-radio seed.
- [ ] Add partial unique open-assignment index.
- [ ] Enable RLS and role-aware SELECT policies.
- [ ] Deny normal direct mutations and implement SECURITY DEFINER RPCs with caller validation.
- [ ] Add append-only audit behavior and effective radio status view.

### Task 4: Authentication and role-aware application shell
**Files:** Modify `index.html`, `styles.css`, `src/app.js`.
**Interfaces:** sign-in screen, session restore, manager workspace, employee workspace, sign-out.
- [ ] Add DOM structure tests for sign-in and identity controls.
- [ ] Confirm RED.
- [ ] Implement role-aware shell and connection/loading banners.
- [ ] Confirm UI tests pass.

### Task 5: Backend-driven manager dashboard and employee workspace
**Files:** Modify `src/app.js`, `src/view-models.js`, `styles.css`; tests `tests/role-ui.test.js`.
**Interfaces:** manager fleet view, employee current assignment/available radios/history, server mutation feedback.
- [ ] Write tests for manager/employee view models and permission visibility.
- [ ] Confirm RED.
- [ ] Implement backend data loading and render paths.
- [ ] Confirm GREEN.

### Task 6: Realtime, QR/manual checkout, repair/dock controls, audit view
**Files:** Modify `src/app.js`, `src/scanner.js`, `styles.css`.
**Interfaces:** realtime refresh, manager audit list, QR/manual checkout, repair/dock mutations.
- [ ] Preserve valid QR parsing WT-01..WT-40.
- [ ] Wire all mutations to RPCs and reload affected server state on failure.
- [ ] Add realtime subscriptions for radios/assignments.
- [ ] Render manager-only audit and operational controls.

### Task 7: Vercel deployment configuration and documentation
**Files:** Create `config.example.js`, `vercel.json`, `.gitignore`; modify `README.md`.
- [ ] Document Supabase project/migration setup.
- [ ] Document first manager profile creation.
- [ ] Document public frontend config values only.
- [ ] Document Vercel deployment/custom domain and production verification checklist.

### Task 8: Final verification/package
- [ ] Run complete `npm test` and require zero failures.
- [ ] Validate JavaScript syntax/import graph.
- [ ] Scan source for service-role/secret key patterns.
- [ ] Package the production-ready source tree for delivery.
