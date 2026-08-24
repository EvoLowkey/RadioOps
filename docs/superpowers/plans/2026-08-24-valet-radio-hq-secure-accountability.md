# Valet Radio HQ Secure Accountability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps
> use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add secure radio QR identities, one-time equipment agreement,
shift-aware return accountability, Manager-reviewed discipline, and
Manager-controlled Valet Associate/GSC Captain/Cashier roles to the
existing Valet Radio HQ production app.

**Architecture:** Extend the existing static/PWA + Supabase application
without replacing its working scan-only radio flow. Security-sensitive
operations live in Supabase RPCs/RLS; the client receives only safe
radio/assignment data and uses focused UI modules for agreements,
shifts, reminders, incidents, discipline, and role-aware read-only
views.

**Tech Stack:** HTML/CSS/vanilla JavaScript PWA, Supabase
Auth/Postgres/RPC/RLS, existing browser QR/camera implementation, Web
Notifications where supported, Node-based regression tests.

**Spec:**
`docs/superpowers/specs/2026-08-24-valet-radio-hq-secure-accountability-design.md`

## Global Constraints

-   Preserve existing employee/Manager authentication, mobile
    Safari/Chrome camera scanning, PWA behavior, Manager Operations
    Overview, My Radio, password recovery, and current production
    features.
-   Employee checkout and return remain physical QR-scan-only
    operations.
-   Secure QR tokens must never be exposed through normal fleet/history
    responses.
-   Manager-only mutations must be authorized server-side, not merely
    hidden in the UI.
-   GSC Captain and Cashier have identical read-only access to Currently
    Checked Out and Radio History and no Manager mutation privileges.
-   No automatic wage/tip deduction, tip confiscation, employee charge,
    or determination of financial liability.
-   Tip Release Pending is an operational status only; payroll/timeclock
    integration is out of scope.
-   Agreement acceptances, submitted Write-Up employee statements, and
    Write-Up acknowledgments are immutable.
-   AM = 06:55--15:00; PM = 15:00--23:00; Overnight = 23:00--07:00 next
    day.
-   Return reminder states occur 15 minutes before shift end and at
    shift end.

------------------------------------------------------------------------

## File Structure

Follow the current repository layout after unpacking the latest
production package. Expected existing files include `index.html`,
`styles.css`, `src/app.js`, `src/api.js`, `src/view-models.js`,
`service-worker.js`, SQL migration files, and the existing test
directory. Do not perform unrelated restructuring.

Create focused modules only where the current code permits ES-module
imports without breaking the build:

-   `src/shift-policy.js` --- pure shift/date calculations.
-   `src/permissions.js` --- pure role/capability predicates used by
    rendering and actions.
-   `src/accountability.js` --- client orchestration for
    agreement/shift/return/discipline state.
-   `supabase/migrations/20260824_secure_accountability.sql` --- schema,
    RLS, RPCs, indexes, and server-side authorization.
-   `tests/shift-policy.test.js`, `tests/permissions.test.js`,
    `tests/accountability.test.js`, plus extensions to existing API/UI
    tests.

If the production package does not use these exact folders, place each
new file beside the corresponding existing source/test files while
preserving these responsibilities.

------------------------------------------------------------------------

### Task 1: Pure Shift Policy

**Files:** - Create: `src/shift-policy.js` - Create:
`tests/shift-policy.test.js`

**Interfaces:** - Produces: `SHIFT_DEFINITIONS`,
`resolveShiftWindow(shiftCode, selectedDate, timeZone)`,
`getReturnReminderState(now, shiftWindow)`. - `resolveShiftWindow`
returns `{ code, label, startsAt, endsAt, reminderAt }` as ISO
timestamps; Overnight ends on the following calendar day. -
`getReturnReminderState` returns one of `none`, `fifteen_minutes`,
`shift_ended`.

-   [ ] **Step 1: Write failing tests for all three shift windows**

``` js
assert.equal(resolveShiftWindow('AM', '2026-08-24', 'America/Chicago').label, 'AM Shift');
assert.equal(resolveShiftWindow('PM', '2026-08-24', 'America/Chicago').label, 'PM Shift');
const overnight = resolveShiftWindow('OVERNIGHT', '2026-08-24', 'America/Chicago');
assert.ok(new Date(overnight.endsAt) > new Date(overnight.startsAt));
assert.equal(new Date(overnight.endsAt).getDate(), 25);
```

-   [ ] **Step 2: Run the shift tests and verify RED**

Run the repository's Node test command scoped to
`tests/shift-policy.test.js`. Expected: failure because
`src/shift-policy.js` does not exist.

-   [ ] **Step 3: Implement exact shift definitions and reminder-state
    calculation**

``` js
export const SHIFT_DEFINITIONS = Object.freeze({
  AM: { label: 'AM Shift', start: '06:55', end: '15:00' },
  PM: { label: 'PM Shift', start: '15:00', end: '23:00' },
  OVERNIGHT: { label: 'Overnight Shift', start: '23:00', end: '07:00', crossesMidnight: true },
});
```

Implement timezone-safe construction using the date/time utilities
already present in the repo; do not add a dependency solely for this
calculation unless the existing project cannot safely construct
`America/Chicago` timestamps.

-   [ ] **Step 4: Add failing boundary tests for 15-minute reminder and
    shift end**

Test one second before reminder, exactly at reminder, one second before
end, and exactly at end.

-   [ ] **Step 5: Implement `getReturnReminderState` and run tests
    GREEN**

-   [ ] **Step 6: Commit**

``` bash
git add src/shift-policy.js tests/shift-policy.test.js
git commit -m "feat: add radio shift policy"
```

------------------------------------------------------------------------

### Task 2: Role and Capability Model

**Files:** - Create: `src/permissions.js` - Create:
`tests/permissions.test.js` - Modify: existing profile/role
normalization code in `src/app.js` or `src/view-models.js`

**Interfaces:** - Produces: `ROLE.VALET_ASSOCIATE`, `ROLE.GSC_CAPTAIN`,
`ROLE.CASHIER`, `ROLE.MANAGER`. - Produces:
`canViewOperationalRadioData(role)`, `canMutateFleet(role)`,
`canManageRoles(role)`, `canManageDiscipline(role)`.

-   [ ] **Step 1: Write failing permission-matrix tests**

``` js
assert.equal(canViewOperationalRadioData(ROLE.VALET_ASSOCIATE), false);
assert.equal(canViewOperationalRadioData(ROLE.GSC_CAPTAIN), true);
assert.equal(canViewOperationalRadioData(ROLE.CASHIER), true);
assert.equal(canViewOperationalRadioData(ROLE.MANAGER), true);
assert.equal(canManageRoles(ROLE.GSC_CAPTAIN), false);
assert.equal(canManageRoles(ROLE.CASHIER), false);
assert.equal(canManageRoles(ROLE.MANAGER), true);
```

-   [ ] **Step 2: Run tests and verify RED**

-   [ ] **Step 3: Implement the capability predicates with explicit
    allowlists**

Do not infer privilege from role ordering. Each capability must list
allowed roles explicitly so adding a future title cannot accidentally
inherit Manager access.

-   [ ] **Step 4: Normalize legacy employee role values to
    `valet_associate` without changing existing Managers**

-   [ ] **Step 5: Run role tests and existing authorization/UI tests
    GREEN**

-   [ ] **Step 6: Commit**

``` bash
git add src/permissions.js tests/permissions.test.js src/app.js src/view-models.js
git commit -m "feat: add operational employee roles"
```

------------------------------------------------------------------------

### Task 3: Supabase Accountability Schema and RLS

**Files:** - Create:
`supabase/migrations/20260824_secure_accountability.sql` - Extend:
existing SQL migration regression/static checks

**Interfaces:** - Produces tables/columns for secure QR identity,
agreements/acceptances, assignment shift metadata, incidents,
disciplinary records, statements/acknowledgments, and role-change audit
data. - Existing radio IDs and assignment/history data remain
authoritative; migration must preserve them.

-   [ ] **Step 1: Add failing SQL/static tests asserting required
    schema/RPC names and forbidden client token exposure**

Require the migration to define at minimum: `radio_qr_credentials`,
`equipment_agreements`, `equipment_agreement_acceptances`,
`radio_incidents`, `disciplinary_records`, and the RPCs named in later
tasks.

-   [ ] **Step 2: Run migration tests and verify RED**

-   [ ] **Step 3: Create schema with restrictive defaults**

Use UUID/random-token-capable Postgres primitives already enabled by
Supabase. Store a one-way digest of QR bearer tokens when practical so
database reads do not expose usable tokens. Enforce unique active
credential per radio and immutable acceptance rows.

-   [ ] **Step 4: Add role values and server-side helper predicates**

Manager authorization must derive from the authenticated user's current
server-side profile. GSC Captain/Cashier read policies may expose safe
current-holder/history fields but never QR credential material or
Manager-only disciplinary details beyond records explicitly intended for
the subject employee.

-   [ ] **Step 5: Add immutable-row triggers/policies**

Reject UPDATE/DELETE on agreement acceptances and submitted Write-Up
statements/acknowledgments through ordinary client access.

-   [ ] **Step 6: Run migration in a disposable/test Supabase
    environment or transaction-based SQL harness and verify GREEN**

-   [ ] **Step 7: Commit**

``` bash
git add supabase/migrations/20260824_secure_accountability.sql tests
git commit -m "feat: add accountability data model"
```

------------------------------------------------------------------------

### Task 4: Secure QR Credential Issuance and Rotation

**Files:** - Modify:
`supabase/migrations/20260824_secure_accountability.sql` - Modify:
`src/api.js` - Modify/Create: API tests

**Interfaces:** - Produces Manager RPC
`rotate_radio_qr_token(p_radio_id)` returning a newly generated
printable token exactly once. - Produces employee-safe RPC
`resolve_radio_qr_for_checkout(p_token)` that validates the bearer token
without returning credential rows. - Existing return RPC is
extended/replaced to validate the scanned token against the
authenticated employee's assigned radio.

-   [ ] **Step 1: Write failing tests for token rotation and
    invalidation**

Test: Manager rotates WT-17 token A → token A works; Manager rotates
again → token A fails and token B works; non-Manager rotation fails.

-   [ ] **Step 2: Verify RED**

-   [ ] **Step 3: Implement cryptographically random token generation
    and digest comparison**

Generate sufficient entropy server-side; never derive tokens from
`WT-17`, radio UUIDs, employee IDs, or timestamps alone. Audit every
rotation with radio, acting Manager, and timestamp.

-   [ ] **Step 4: Extend `src/api.js` with narrowly scoped methods**

``` js
export async function checkoutRadioBySecureQr(token, shiftCode, shiftDate) { /* RPC */ }
export async function returnAssignedRadioBySecureQr(token) { /* RPC */ }
export async function rotateRadioQrToken(radioId) { /* Manager RPC */ }
```

-   [ ] **Step 5: Test unavailable statuses and mismatched returns**

Lost/Missing/Damaged/In Repair/already-assigned radios reject normal
employee checkout. Returning any radio other than the authenticated
employee's current assignment rejects the operation.

-   [ ] **Step 6: Run API/security tests GREEN and commit**

``` bash
git add src/api.js supabase/migrations/20260824_secure_accountability.sql tests
git commit -m "feat: secure radio qr credentials"
```

------------------------------------------------------------------------

### Task 5: Versioned Equipment Agreement

**Files:** - Modify: migration SQL - Modify: `src/api.js` -
Create/Modify: `src/accountability.js` - Modify: `index.html`,
`styles.css`, `src/app.js` - Test: `tests/accountability.test.js` and UI
tests

**Interfaces:** - Produces `getCurrentEquipmentAgreement()`,
`getMyAgreementAcceptance(version)`,
`acceptEquipmentAgreement(version)`. - Checkout orchestration must
refuse to open the checkout camera until the current required agreement
is accepted.

-   [ ] **Step 1: Write failing tests for first-use gate and one-time
    behavior**

Test approved employee with no acceptance → agreement required; after
acceptance → camera path allowed; repeat checkout → agreement skipped;
duplicate acceptance does not create duplicate rows.

-   [ ] **Step 2: Verify RED**

-   [ ] **Step 3: Seed agreement version 1 with the approved policy
    text**

Include equipment care, same-radio return, reporting, unauthorized
transfer/misuse/negligence, possible corrective action subject to
Manager review/company policy, and the explicit statement that
acceptance does not automatically create financial responsibility.

-   [ ] **Step 4: Implement immutable acceptance RPC and API methods**

-   [ ] **Step 5: Implement accessible agreement modal/screen**

`Accept & Continue` remains disabled until the unchecked acknowledgment
checkbox is actively selected. After successful acceptance, continue
directly to the QR camera without a Manager approval step.

-   [ ] **Step 6: Run agreement/API/UI tests GREEN and commit**

``` bash
git add index.html styles.css src/app.js src/api.js src/accountability.js supabase/migrations/20260824_secure_accountability.sql tests
git commit -m "feat: add one-time equipment agreement"
```

------------------------------------------------------------------------

### Task 6: Shift Selection Integrated With Scan Checkout

**Files:** - Modify: `index.html`, `styles.css`, `src/app.js`,
`src/accountability.js`, `src/api.js` - Test: UI/accountability tests

**Interfaces:** - Employee checkout sequence: shift selection →
agreement if required → camera → secure QR checkout. - Checkout RPC
receives `shiftCode` and the selected local work date and stores
resolved due time server-side.

-   [ ] **Step 1: Write failing UI/orchestration tests**

Assert the three exact buttons and times appear and that checkout cannot
start without a shift selection.

-   [ ] **Step 2: Verify RED**

-   [ ] **Step 3: Render mobile-friendly shift cards**

Labels must be exactly `AM Shift · 6:55 AM–3:00 PM`,
`PM Shift · 3:00 PM–11:00 PM`, and `Overnight Shift · 11:00 PM–7:00 AM`.

-   [ ] **Step 4: Pass shift metadata through secure checkout and
    display it on My Radio**

My Radio shows shift, WT ID, checkout time, and return due time.

-   [ ] **Step 5: Run all checkout/return and mobile-layout tests GREEN
    and commit**

``` bash
git add index.html styles.css src/app.js src/api.js src/accountability.js tests
git commit -m "feat: add shift-aware radio checkout"
```

------------------------------------------------------------------------

### Task 7: Return Reminder and Operational Tip Status

**Files:** - Modify: migration SQL, `src/accountability.js`,
`src/app.js`, `service-worker.js`, `index.html`, `styles.css` - Test:
reminder/PWA tests

**Interfaces:** - Produces assignment states `active`,
`return_due_soon`, `unreturned_after_shift`, `returned` and operational
tip states `not_applicable`, `tip_release_pending`,
`tip_release_cleared`. - In-app reminder is authoritative UI fallback;
browser notification is supplemental.

-   [ ] **Step 1: Write failing tests for 15-minute and shift-end state
    transitions**

Ensure transitions are idempotent and only apply while a radio remains
assigned.

-   [ ] **Step 2: Verify RED**

-   [ ] **Step 3: Implement server-derived due-state query/RPC**

Do not trust a manually changed client clock to determine
Manager-visible overdue status.

-   [ ] **Step 4: Implement in-app reminder banner/card and
    notification-permission flow**

Do not block radio return when notification permission is denied. Use
existing PWA service-worker conventions and avoid promising background
push on platforms where no push subscription/backend exists.

-   [ ] **Step 5: On successful return set `tip_release_cleared`; at due
    end while still assigned expose `tip_release_pending`**

Do not connect these fields to payroll deductions or payment APIs.

-   [ ] **Step 6: Run PWA/reminder/return regression tests GREEN and
    commit**

``` bash
git add index.html styles.css src/app.js src/accountability.js service-worker.js supabase/migrations/20260824_secure_accountability.sql tests
git commit -m "feat: add shift return reminders"
```

------------------------------------------------------------------------

### Task 8: Manager Radio Exception and Incident Workflow

**Files:** - Modify: migration SQL, `src/api.js`, `src/app.js`,
`index.html`, `styles.css` - Test: Manager authorization/incident tests

**Interfaces:** - Produces Manager RPC
`resolve_radio_return_exception(assignment_id, incident_type, radio_status, explanation)`. -
Incident types include `lost`, `missing`, `damaged`, `stolen`,
`malfunction`, and `other`.

-   [ ] **Step 1: Write failing tests for Manager-only exception
    resolution**

Non-Managers fail server-side. Manager resolution records assignment,
employee, radio, shift, incident, explanation, Manager, timestamps,
occurrence number, status, and resolution.

-   [ ] **Step 2: Verify RED**

-   [ ] **Step 3: Implement transactional exception RPC**

The RPC must resolve the outstanding equipment obligation and update
radio status consistently without erasing original checkout history.

-   [ ] **Step 4: Add Manager UI `Resolve Exception` from outstanding
    assignment/radio views**

Require incident type and explanation before submission; show
confirmation before mutation.

-   [ ] **Step 5: Add audit-log event and Manager Operations Overview
    state**

-   [ ] **Step 6: Run tests GREEN and commit**

``` bash
git add index.html styles.css src/app.js src/api.js supabase/migrations/20260824_secure_accountability.sql tests
git commit -m "feat: add manager radio exceptions"
```

------------------------------------------------------------------------

### Task 9: Progressive Discipline and Employee Statements

**Files:** - Modify: migration SQL, `src/api.js`, `src/app.js`,
`index.html`, `styles.css` - Test: discipline tests

**Interfaces:** - Produces Manager RPC
`create_radio_discipline(incident_id, level, manager_notes, financial_review_required)`
where level is `written_warning` or `write_up`. - Produces employee RPC
`submit_writeup_response(disciplinary_record_id, employee_statement, acknowledge_receipt)`.

-   [ ] **Step 1: Write failing tests for discipline authorization and
    occurrence behavior**

First qualifying occurrence may be Written Warning; later qualifying
occurrence may be Write-Up. The software must require Manager action
rather than auto-issuing discipline solely from occurrence count.

-   [ ] **Step 2: Verify RED**

-   [ ] **Step 3: Implement Manager discipline creation and optional
    `financial_review_required` flag**

The flag is informational only and must not create a balance, deduction,
tip hold transaction, or employee debt.

-   [ ] **Step 4: Implement employee Written Warning view**

Permit an optional statement according to the approved workflow but do
not require an acknowledgment action for a Written Warning.

-   [ ] **Step 5: Implement Write-Up view, optional statement, and
    required receipt acknowledgment**

Display:
`By selecting I Acknowledge Receipt, I confirm that I have received and reviewed this notice. My acknowledgment confirms receipt only and does not necessarily mean that I agree with the findings or corrective action.`

-   [ ] **Step 6: Enforce immutable submitted statement/acknowledgment
    server-side**

A second submission attempt must fail or return the existing immutable
record without modification.

-   [ ] **Step 7: Run discipline tests GREEN and commit**

``` bash
git add index.html styles.css src/app.js src/api.js supabase/migrations/20260824_secure_accountability.sql tests
git commit -m "feat: add radio disciplinary records"
```

------------------------------------------------------------------------

### Task 10: Manager Role Promotion and Read-Only Captain/Cashier Views

**Files:** - Modify: migration SQL, `src/api.js`, `src/app.js`,
`src/view-models.js`, `index.html`, `styles.css` - Test: role/RLS/UI
tests

**Interfaces:** - Produces Manager RPC
`set_employee_operational_role(employee_id, new_role)` accepting
`valet_associate`, `gsc_captain`, `cashier` for employee operational
roles while preserving existing Manager administration. - Produces safe
read queries/RPCs for `Currently Checked Out` and `Radio History` usable
by GSC Captain, Cashier, and Manager.

-   [ ] **Step 1: Write failing server authorization tests**

Valet Associate cannot promote; GSC Captain cannot promote; Cashier
cannot promote; Manager can promote/demote. GSC Captain and Cashier can
read safe operational radio views but cannot mutate fleet state.

-   [ ] **Step 2: Verify RED**

-   [ ] **Step 3: Implement Manager role RPC and role-change audit
    event**

Store employee, previous role, new role, acting Manager, timestamp.

-   [ ] **Step 4: Add Manager profile control**

Provide explicit choices `Valet Associate`, `GSC Captain`, `Cashier`;
require confirmation before changing role.

-   [ ] **Step 5: Add read-only Captain/Cashier navigation and views**

Reuse safe Manager view-models where possible, but remove/hide mutation
controls and enforce read-only behavior server-side.

-   [ ] **Step 6: Run role/RLS/UI tests GREEN and commit**

``` bash
git add index.html styles.css src/app.js src/api.js src/view-models.js supabase/migrations/20260824_secure_accountability.sql tests
git commit -m "feat: add captain and cashier radio access"
```

------------------------------------------------------------------------

### Task 11: Manager QR Label Export for WT-01--WT-40

**Files:** - Modify: `src/api.js`, `src/app.js`, `index.html`,
`styles.css` - Create: focused QR label export module if current QR
library supports client-side rendering - Test: QR export tests

**Interfaces:** - Manager can rotate/issue a token and generate a
printable label containing visible WT ID + QR token representation
without persisting plaintext token in normal client state after export.

-   [ ] **Step 1: Write failing tests that label data pairs each visible
    WT ID with only its newly issued secure token**

-   [ ] **Step 2: Verify RED**

-   [ ] **Step 3: Implement Manager-only label generation workflow**

Use the project's existing QR rendering dependency if present. Do not
introduce an external QR web service because that would disclose bearer
tokens to a third party.

-   [ ] **Step 4: Create print layout for WT-01--WT-40 and matching
    human-readable dock identifiers**

Keep the QR high-contrast and sufficiently large; luxury black/gold
branding must not reduce QR quiet-zone or scan contrast.

-   [ ] **Step 5: Test regenerated labels invalidate old scans and new
    printed codes resolve correctly**

-   [ ] **Step 6: Commit**

``` bash
git add src index.html styles.css tests
git commit -m "feat: add secure radio qr labels"
```

------------------------------------------------------------------------

### Task 12: Full Regression, PWA Cache Bump, and Deployment Package

**Files:** - Modify: `service-worker.js` cache version - Modify: project
README/deployment notes if present - Verify: all source, migration, and
test files

**Interfaces:** - Produces a deployable GitHub package and one ordered
Supabase migration with documented rollout steps.

-   [ ] **Step 1: Run the complete existing + new test suite**

Expected: 0 failures. Do not update expectations merely to hide
regressions.

-   [ ] **Step 2: Run JavaScript syntax/static checks on every modified
    JS file**

-   [ ] **Step 3: Search production files for privileged Supabase
    secrets and plaintext generated QR tokens**

Expected: no service-role/secret key and no issued bearer token embedded
in source/build artifacts.

-   [ ] **Step 4: Bump PWA cache version and rerun PWA tests**

-   [ ] **Step 5: Perform role-by-role acceptance test**

Valet Associate: shift → first-use agreement → secure scan checkout → My
Radio → same-radio return.\
GSC Captain: same employee flow + read-only checked-out/history.\
Cashier: same as GSC Captain.\
Manager: full operations + role change + QR rotation + exception +
discipline.

-   [ ] **Step 6: Perform shift boundary acceptance tests**

AM due 15:00, PM due 23:00, Overnight due 07:00 next day; verify
reminder state 15 minutes before and shift-end state.

-   [ ] **Step 7: Verify incident/discipline immutability and audit
    history**

-   [ ] **Step 8: Document rollout order**

1.  Back up/confirm current production deployment.\
2.  Apply Supabase migration.\
3.  Verify migration/RPC smoke tests.\
4.  Deploy GitHub/Vercel application update.\
5.  Verify Manager account first.\
6.  Verify one test Valet Associate checkout/return.\
7.  Verify GSC Captain and Cashier read-only access.\
8.  Generate/print physical QR labels only after secure token issuance
    is live.

-   [ ] **Step 9: Commit release preparation**

``` bash
git add .
git commit -m "release: secure radio accountability workflow"
```
