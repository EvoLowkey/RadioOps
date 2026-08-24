# Manager Operations Overview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Managers a first-screen operational overview of checked-out, overdue/unreturned, and unavailable radios with last-holder context, recent operational events, filters, and quick actions.

**Architecture:** Extend existing view-model helpers to derive overview data from the already-loaded radios/history/profiles/audit events. Render a Manager-only dashboard section using existing drawer, return, condition-management, and navigation actions; no new backend tables or RPCs are required.

**Tech Stack:** HTML5, CSS3, JavaScript ES modules, Node.js built-in test runner, Supabase-backed existing state.

**Spec:** Approved conversation design for Manager Operations Overview (2026-08-24).

## Global Constraints
- Manager-only; regular Employee My Radio experience remains unchanged.
- Overdue is derived from expected return time and must not mutate stored radio status just for display.
- Reuse existing Manager return/condition controls and audit data.
- No new Supabase migration is required.
- Preserve PWA, QR-return, auth, employee management, and mobile behavior.

---

### Task 1: Operations overview view models
**Files:** Modify `src/view-models.js`; create `tests/operations-overview.test.js`.
**Interfaces:** Produce `getManagerOperationsOverview(state, query, filter, department)`, `getLastKnownHolder(state, radioId)`, and `getOperationalActivity(auditEvents, profiles, limit)`.
- [ ] Write failing tests for counts, checked-out/overdue/unavailable grouping, last-holder lookup, search/filtering, and recent audit activity.
- [ ] Run targeted tests and confirm failure because helpers do not exist.
- [ ] Implement minimal helpers.
- [ ] Run targeted tests and confirm pass.

### Task 2: Manager dashboard surface
**Files:** Modify `index.html`, `src/app.js`, `styles.css`; create `tests/operations-overview-ui.test.js`.
**Interfaces:** Add `#operationsOverview`, filters, three operational lists, and event feed; wire quick actions to existing drawer, return, condition dialog, employees/history views.
- [ ] Write failing structural/UI tests.
- [ ] Run tests and confirm failure.
- [ ] Add Manager-only markup and responsive styling.
- [ ] Render overview from Task 1 and wire filters/actions.
- [ ] Run targeted tests and confirm pass.

### Task 3: Final verification and packaging
**Files:** Modify `README.md` only if needed; package project ZIP.
- [ ] Run `npm test` and require zero failures.
- [ ] Run syntax checks for modified JavaScript.
- [ ] Scan source for privileged Supabase secret/service-role values.
- [ ] Package GitHub-ready project.
