# Valet Radio HQ --- Secure Radio Accountability, Shift, Discipline, and Role Design

**Date:** 2026-08-24\
**Status:** Approved design pending implementation-plan review

## Purpose

Extend the existing Valet Radio HQ production application with secure
physical radio identity, one-time equipment-use acknowledgment,
shift-aware return reminders, auditable lost/missing-radio handling,
progressive disciplinary documentation, and Manager-controlled
operational roles.

The existing scan-only checkout/return behavior remains the foundation.
Employees must physically scan the radio they take and must scan that
same radio to return it.

## 1. Secure QR identity

Each radio keeps its visible fleet identifier (`WT-01` through `WT-40`)
but receives a separate cryptographically random QR token stored
server-side. The printed label displays the visible WT number and Valet
Radio HQ branding; the QR encodes the random token rather than the
predictable WT number.

A QR token resolves to exactly one radio. Checkout succeeds only when
the token is valid and that radio is available. Return succeeds only
when the scanned token resolves to the radio currently assigned to the
authenticated employee.

Only Managers may regenerate a QR token. Regeneration immediately
invalidates the previous token, leaves the visible WT number unchanged,
and creates an audit-log event containing the radio, Manager, and
timestamp. Employees, GSC Captains, and Cashiers cannot generate,
reveal, or regenerate tokens.

## 2. One-time Radio & Equipment Use Agreement

An approved employee does not need additional Manager approval to accept
the equipment agreement. On the employee's first radio checkout attempt,
after selecting a shift and before the camera opens, Valet Radio HQ
displays the current Radio & Equipment Use Agreement.

The agreement covers reasonable care of company equipment, proper use,
no unauthorized transfer, return of the same physical radio, prompt
reporting of loss/damage/theft/malfunction, and the possibility of
corrective or disciplinary action---including a written
warning/write-up---subject to management review and company policy.

The agreement explicitly states that acceptance does **not**
automatically make the employee financially responsible for lost or
damaged equipment.

The employee must actively check
`I have read and agree to the Radio & Equipment Use Agreement` before
`Accept & Continue` is enabled. Acceptance records are immutable and
store employee/user ID, agreement version, agreement title, and
acceptance timestamp. Managers may view acceptance records but may not
edit, revoke, or delete them.

The normal rule is one-time acceptance. The system retains version
support so management can intentionally require acceptance again only if
a materially revised agreement is published in the future.

## 3. Employee-selected shifts

At the beginning of a working day, the employee selects the shift that
matches the schedule already assigned by the workplace:

-   **AM Shift:** 6:55 AM--3:00 PM
-   **PM Shift:** 3:00 PM--11:00 PM
-   **Overnight Shift:** 11:00 PM--7:00 AM

The selected shift is attached to that day's radio assignment. Overnight
shifts correctly cross midnight. The employee's My Radio card displays
the active shift, assigned WT radio, checkout time, and return-due time.

Shift selection does not replace the employer's scheduling/timeclock
system; it records which scheduled shift the employee is working for
radio-accountability purposes.

## 4. Return reminders and shift completion

If the employee still has a radio assigned, Valet Radio HQ sends/queues
a return reminder 15 minutes before the selected shift ends and another
at shift end.

Example pre-end notification:
`Radio Return Required — Your shift ends in 15 minutes. Please return and scan your assigned radio before clocking out and receiving tips.`

At shift end, an unreturned assignment becomes `Unreturned After Shift`
and the operational tip status becomes `Tip Release Pending`. The
employee UI prominently instructs the employee to return and scan the
exact assigned radio. A successful same-radio QR return changes the
operational status to `Radio Returned — Tip Release Cleared`.

Valet Radio HQ does not integrate with or directly control payroll, the
employer's timeclock, or actual tip disbursement in this phase.
`Tip Release Pending` is an operational flag for Managers; the
application does not confiscate, deduct, calculate, or automatically
withhold earned wages/tips.

Browser/app notifications require notification permission. The UI must
also show the same reminder/status in-app so the workflow still
functions when push notifications are unavailable or denied.

## 5. Lost, missing, damaged, or otherwise unreturnable radios

An employee who cannot physically return the assigned radio is not
permanently trapped in the return flow. A Manager-only exception
workflow allows the Manager to review the incident, classify the radio
appropriately (for example Lost, Missing, Damaged, or In Repair), record
an explanation, and resolve the outstanding equipment-return
requirement.

Every exception records employee, radio, shift, incident type, Manager,
timestamps, explanation, occurrence number, radio status, and resolution
in auditable history.

No employee charge is automatically created. A later qualifying
occurrence may be marked `Financial Review Required`, but Valet Radio HQ
does not calculate, deduct, collect, or determine financial liability.
Any financial decision remains an authorized Manager/HR/payroll process
outside the automatic radio workflow and subject to company policy and
applicable law.

## 6. Progressive disciplinary documentation

Qualifying lost/missing-radio occurrences may use progressive
documentation after Manager review:

-   **First qualifying occurrence:** Written Warning.
-   **Subsequent qualifying occurrence:** Write-Up / Corrective Action
    and, when management chooses, `Financial Review Required`.

The software does not automatically conclude that an employee committed
misconduct merely because a radio is missing. The Manager reviews the
circumstances first.

A Written Warning is viewable by the employee. The employee may provide
an optional statement, but no in-app acknowledgment is required for the
Written Warning under the approved workflow.

A Write-Up is viewable by the employee, provides an optional Employee
Statement field, and requires the employee to select
`I Acknowledge Receipt` in the app. The acknowledgment text states that
acknowledgment confirms receipt/review only and does not necessarily
mean agreement with the findings or corrective action.

Once submitted, the Employee Statement and Write-Up acknowledgment are
immutable. Neither the employee nor a Manager can edit or delete the
original submission. The system stores the incident, disciplinary level,
Manager, notice timestamp, employee statement, acknowledgment timestamp,
and occurrence number.

## 7. Roles and permissions

Valet Radio HQ distinguishes administrative authority from operational
job roles.

### Valet Associate

Normal employee access: select shift, accept the one-time equipment
agreement when required, scan a secure QR to check out, view My Radio
and personal recent activity, scan the same radio to return it, receive
return reminders, view applicable warnings/write-ups, submit permitted
statements, and acknowledge Write-Ups.

### GSC Captain

Everything available to a Valet Associate, plus read-only access to
**Currently Checked Out** and **Radio History**, including which
employee currently holds each checked-out radio. No administrative
mutation privileges.

### Cashier

Exactly the same application privileges as GSC Captain: normal employee
functionality plus read-only **Currently Checked Out** and **Radio
History**.

### Manager

Full existing administrative access plus Manager-only promotion/demotion
among Valet Associate, GSC Captain, and Cashier; QR-token regeneration;
lost/damaged/missing exception resolution; disciplinary record creation;
and access to the relevant audit information.

Only Managers may change an employee's operational role. Valet
Associates, GSC Captains, and Cashiers cannot change their own role or
another employee's role. Every role change records employee, previous
role, new role, acting Manager, and timestamp.

GSC Captain and Cashier are **not** Manager-equivalent roles. They
cannot approve/remove employees, promote/demote roles, regenerate QR
codes, alter radio condition, issue discipline, resolve Manager
exceptions, or use Manager-only overrides.

## 8. Data model boundaries

Implementation should add focused server-side records rather than
overloading the employee profile:

-   Radio secure QR identity and token rotation metadata.
-   Versioned equipment agreements and immutable employee acceptances.
-   Shift/assignment metadata including selected shift and due time.
-   Return-reminder / shift-return status sufficient for idempotent
    reminders and Manager visibility.
-   Radio incident/exception records.
-   Disciplinary records, immutable employee statements, and Write-Up
    acknowledgments.
-   Operational role value and role-change audit events.

Sensitive QR tokens must not be exposed in normal fleet/history
responses. Server-side/RPC authorization must enforce permissions;
hiding buttons in the UI is not sufficient security.

## 9. User flow

For an employee's first checkout:

`Choose scheduled shift → Equipment agreement → Accept → Open camera → Scan secure radio QR → Validate radio → Checkout → My Radio`

For later checkouts:

`Choose scheduled shift → Open camera → Scan secure radio QR → Validate radio → Checkout → My Radio`

For return:

`Return reminder/status → Scan QR to Return → Resolve token → Confirm it matches assigned radio → Return → Radio Returned / Tip Release Cleared`

For an unreturnable radio:

`Employee reports issue → Manager reviews → Manager records exception/status → Equipment obligation resolved as appropriate → disciplinary workflow only if Manager determines it applies`

## 10. Error handling and security requirements

Invalid, expired, regenerated, or unknown QR tokens must fail without
revealing another radio's secure token. A scan for a radio that is Lost,
Missing, Damaged, In Repair, or already assigned must not create a
normal employee checkout.

A return scan for any radio other than the authenticated employee's
currently assigned radio must be rejected. Duplicate acceptance, return,
reminder, acknowledgment, and Manager-resolution operations must be
idempotent where practical so refreshes/retries do not create duplicate
records.

All privileged actions must be authorized server-side using the
authenticated user's current role. Manager-only mutations must not rely
solely on client-side role checks.

## 11. Testing requirements

The implementation must add regression coverage for secure-token
checkout/return, invalidated token rejection after regeneration,
one-time agreement behavior, agreement immutability, all three shift
boundaries including overnight rollover, 15-minute and shift-end
reminder state, unreturned-after-shift state, Manager exception
resolution, disciplinary occurrence behavior, Write-Up
acknowledgment/statement immutability, role promotion/demotion
authorization, and read-only GSC Captain/Cashier access.

Existing employee/Manager authentication, mobile Safari/Chrome camera
scanning, PWA behavior, Manager Operations Overview, employee My Radio
experience, password recovery, and current production features must
remain working.

## 12. Out of scope for this phase

-   Payroll/timeclock integration.
-   Automatic wage or tip deductions/withholding.
-   Automatic determination of employee financial liability.
-   Automatic disciplinary findings without Manager review.
-   Employee self-promotion.
-   GSC Captain/Cashier administrative mutation privileges.
-   Purchase/change of the future `valetradiohq.com` domain.
