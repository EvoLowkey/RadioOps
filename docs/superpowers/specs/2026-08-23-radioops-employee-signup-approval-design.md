# RadioOps Employee Signup, Approval, and Simplified Employee Interface Design

## Goal
Add self-service employee registration to RadioOps while keeping workplace access controlled by Managers. Any email address may register, but new users remain Pending until a Manager approves them. Approved Employees receive a simplified radio-only interface; Managers retain the full operations dashboard and gain an Employees administration section.

## Existing Production Context
RadioOps already uses Supabase Auth, PostgreSQL, Row Level Security, Vercel hosting, realtime fleet state, Manager/Employee roles, 40 radios (WT-01 through WT-40), checkout/return RPCs, assignment history, repair controls, charging-dock status, and audit events.

The current `profiles` table assumes every authenticated user already has an active profile. This upgrade changes onboarding so a newly authenticated user can exist safely before approval without gaining fleet access.

## User Roles and Account States

### Roles
- `MANAGER`: full fleet and employee-administration access.
- `EMPLOYEE`: radio self-service access only after approval.

### Account states
Each profile has one approval state:
- `PENDING`: signup completed but Manager approval is required.
- `ACTIVE`: approved and allowed to use RadioOps.
- `REJECTED`: signup rejected; no operational access.
- `DISABLED`: previously approved account whose workplace access has been suspended.

`role` and `approval_status` are independent. Self-registration always creates `role = EMPLOYEE` and `approval_status = PENDING`. Browser input can never create a Manager account.

## Registration Flow

1. Login page shows two tabs/actions: **Sign In** and **Create Employee Account**.
2. Employee enters:
   - Full name
   - Employee ID
   - Department
   - Email
   - Password
   - Confirm password
3. Client validates required fields and matching passwords.
4. Supabase Auth creates the user with email/password.
5. A database trigger on `auth.users` creates a `public.profiles` row using safe user metadata, forcing:
   - `role = EMPLOYEE`
   - `approval_status = PENDING`
   - `is_active = false`
6. Employee verifies their email when Supabase email confirmation is enabled.
7. After signup/sign-in, Pending users see only an **Awaiting Manager Approval** screen.
8. A Manager reviews the request from the Employees section.
9. On approval, the profile becomes `approval_status = ACTIVE`, `is_active = true`.
10. On the employee's next session refresh/realtime update, the simplified employee workspace becomes available.

## Duplicate and Validation Rules
- `employee_id` remains unique.
- Email uniqueness is enforced by Supabase Auth.
- Employee ID is normalized by trimming whitespace.
- Display name and department are trimmed and must not be blank.
- A signup that conflicts with an existing employee ID receives a clear message instructing the employee to contact a Manager.
- Password rules follow the configured Supabase Auth policy; the UI displays the returned policy error instead of inventing a second password policy.

## Manager Employees Section
Add a Manager-only **Employees** navigation item.

### Summary cards
- Pending approvals
- Active employees
- Disabled employees
- Employees currently holding radios

### Pending tab
Each pending request displays:
- Employee name
- Employee ID
- Department
- Email
- Email verification state when available
- Signup date/time
- **Approve** button
- **Reject** button

Approval and rejection require confirmation before mutation.

### Active tab
Each active employee displays:
- Name
- Employee ID
- Department
- Email
- Current radio, if any
- Current checkout time, if any
- Last activity
- **View History**
- **Disable Access**

### Disabled / Rejected tab
Managers can see rejected and disabled records separately. Disabled users may be re-enabled by a Manager. Rejected users do not automatically regain access; a Manager must explicitly approve or restore them.

## Manager Actions
All account-state changes happen through SECURITY DEFINER database RPC functions that verify the caller is an active Manager.

Planned functions:
- `approve_employee(p_profile_id uuid)`
- `reject_employee(p_profile_id uuid)`
- `disable_employee(p_profile_id uuid)`
- `enable_employee(p_profile_id uuid)`

Each function:
1. Verifies `auth.uid()` belongs to an active Manager.
2. Locks the target profile row.
3. Prevents inappropriate self-management where necessary (for example, a Manager cannot accidentally disable their own active Manager profile through the Employees page).
4. Applies the state transition.
5. Writes an audit event with the actor and target profile ID.
6. Returns the updated profile summary as JSON.

No browser client receives a Supabase service-role key.

## Profile Schema Changes
Extend `public.profiles` with:
- `email text`
- `approval_status text not null default 'PENDING'`
- `approved_at timestamptz null`
- `approved_by uuid null references public.profiles(id)`
- `rejected_at timestamptz null`
- `disabled_at timestamptz null`
- `last_status_change_at timestamptz not null default now()`

Allowed `approval_status` values:
- `PENDING`
- `ACTIVE`
- `REJECTED`
- `DISABLED`

Existing production users are migrated safely:
- Existing Managers and Employees with `is_active = true` become `ACTIVE`.
- Existing inactive users become `DISABLED` unless explicitly migrated otherwise.

## Auth User Signup Trigger
Create a trigger on `auth.users` that inserts a profile when a new auth user is created.

The trigger reads only approved metadata fields:
- `display_name`
- `employee_id`
- `department`

It ignores any client-supplied `role`, `approval_status`, or `is_active` values and always writes:
- `role = 'EMPLOYEE'`
- `approval_status = 'PENDING'`
- `is_active = false`

The auth user's email is copied into `profiles.email` for Manager review.

## Authorization and RLS

### Pending / Rejected / Disabled user
May:
- Read only their own profile status needed to render the gate screen.

May not:
- Read the radio fleet.
- Read assignments.
- Use checkout/return RPCs.
- Read other employees.
- Read audit events.
- Change their own role or approval state.

### Active Employee
May:
- Read their own profile.
- Read fleet availability required for self-checkout.
- Read their own assignments/history.
- Call `checkout_radio` only for themselves.
- Call `return_radio` only for their own open assignment.

May not:
- Read the full employee directory.
- Approve/reject/disable accounts.
- Access Manager audit controls.
- Place radios into repair or change dock state.

### Active Manager
May:
- Read all employee profiles.
- Read all assignments and audit events.
- Perform existing Manager fleet actions.
- Approve, reject, disable, and enable employee accounts.

## Existing Helper Function Changes
`is_active_user()` becomes true only when:
- `is_active = true`, and
- `approval_status = 'ACTIVE'`.

`is_manager()` becomes true only when:
- `role = 'MANAGER'`,
- `is_active = true`, and
- `approval_status = 'ACTIVE'`.

The existing checkout, return, repair, and dock RPCs continue to rely on these checks so Pending users cannot bypass the UI by calling database functions directly.

## Simplified Employee Interface
Approved Employees do not receive the full Manager dashboard.

### Employee home screen
Header:
- Employee name
- Department
- Sign out

Primary card:
- **My Radio**
- If none assigned: `No radio currently checked out`
- If assigned: radio ID, checkout time, expected return time if present

Primary actions:
- **Scan a Radio**
- **Select a Radio** fallback
- **Check Out**
- **Return My Radio** when assigned

Secondary information:
- Available-radio count
- Their five most recent assignments
- Connection status

### Employee checkout behavior
- If employee already has an open assignment, the UI does not offer a second checkout.
- Employee scans QR code or selects an available radio.
- Confirmation screen shows the exact radio ID.
- Checkout uses the authenticated employee's own profile; there is no target employee selector.

### Employee return behavior
- Return screen defaults to the employee's currently assigned radio.
- Employee may scan the radio for confirmation or tap **Return My Radio**.
- Employees cannot return another employee's radio.

### Hidden Manager functionality
For Employees, hide/remove navigation to:
- Full Dashboard
- Fleet-wide History
- Charging Dock administration
- Audit Log
- Employees administration
- Repair controls
- Manager checkout-on-behalf-of controls

This is a usability simplification only; database policies remain the security boundary.

## Pending Approval Interface
Pending users see a dedicated full-page state rather than a broken dashboard.

Content:
- `Account awaiting approval`
- Their submitted name, employee ID, department, and email
- Explanation that a Manager must approve access
- **Refresh Status** button
- **Sign Out** button

Rejected users see:
- `Account request was not approved`
- Instruction to contact a workplace Manager
- Sign out

Disabled users see:
- `Account access is disabled`
- Instruction to contact a workplace Manager
- Sign out

## Realtime Behavior
Subscribe to changes relevant to the signed-in user's `profiles` row so a Pending employee can move to Active without manually signing out and back in.

Managers refresh the Employees list after approval-state changes and may subscribe to profile changes for newly registered Pending users.

## Audit Events
Add event types:
- `EMPLOYEE_REGISTERED`
- `EMPLOYEE_APPROVED`
- `EMPLOYEE_REJECTED`
- `EMPLOYEE_DISABLED`
- `EMPLOYEE_ENABLED`

Audit metadata should include target profile ID and safe operational context, but never passwords or authentication tokens.

## Email Verification
Any email address is allowed to register.

Recommended Supabase Auth setting:
- Email confirmation enabled.

Approval does not replace email verification. A Manager may approve a profile, but Supabase Auth still controls whether the user has a valid confirmed login session according to the project's Auth settings.

## Error Handling
User-facing errors must be specific and actionable:
- Duplicate employee ID: `That employee ID is already registered. Contact a Manager.`
- Signup failure: display sanitized Supabase Auth message.
- Pending access: show approval state instead of generic authentication failure.
- Realtime unavailable: allow manual **Refresh Status**.
- Manager approval conflict: refresh the Employees list and display the current state.
- Network failure: preserve entered signup form fields except password fields.

## Files / Components Expected to Change
Existing repository structure will be extended, not replaced.

Likely changes:
- `index.html`: signup UI, employee-gate states, Employees manager view, simplified employee workspace containers.
- Frontend JS under `src/`: auth/signup flow, role/state routing, employee manager view, employee simplified workflow, profile realtime subscription.
- `styles.css`: signup, approval gate, employee workspace, employee-directory styling.
- New Supabase migration under `supabase/migrations/`: profile schema upgrade, signup trigger, RLS changes, employee-management RPCs, audit events, existing-user migration.
- Tests under `tests/`: signup role forcing, approval gating, Manager mutations, simplified employee routing, access restrictions.
- `README.md`: enable email signup/confirmation, employee onboarding and Manager approval instructions.

## Testing Requirements

### Database tests / verification
- New signup creates exactly one Pending EMPLOYEE profile.
- Client-supplied Manager role is ignored.
- Pending user cannot select radios or assignments.
- Pending user cannot call checkout/return successfully.
- Manager can see Pending profiles.
- Manager approval changes the account to Active.
- Employee can access fleet only after approval.
- Employee cannot approve, reject, disable, or enable another user.
- Manager can disable an Active Employee.
- Disabled Employee loses fleet access immediately.
- Manager can re-enable a Disabled Employee.
- Employee ID uniqueness remains enforced.
- Existing Manager account remains ACTIVE after migration.

### Frontend tests
- Login screen exposes Create Employee Account.
- Signup form collects name, ID, department, email, password, confirmation.
- Pending user is routed to Pending Approval screen.
- Active Employee is routed to simplified Employee interface.
- Active Manager is routed to full Manager interface.
- Employee UI does not render Manager navigation/actions.
- Manager Employees view renders Pending/Active/Disabled states and actions.
- Employee with open assignment sees Return rather than another Checkout workflow.

### Manual production verification
1. Register a brand-new employee using a non-company email.
2. Confirm signup/profile is Pending.
3. Confirm Pending account cannot view radios.
4. Sign in as Manager and approve the employee.
5. Confirm employee gains access after refresh/realtime update.
6. Employee checks out WT-01.
7. Manager sees WT-01 assigned to that employee.
8. Employee returns WT-01.
9. Manager disables the employee.
10. Confirm employee can no longer access fleet data.
11. Re-enable and confirm access returns.
12. Review audit events for all account state changes.

## Deployment
The upgrade remains deployable through the existing GitHub → Vercel integration.

Deployment sequence:
1. Run the new Supabase migration first.
2. Verify the existing Manager remains Active.
3. Push frontend changes to GitHub.
4. Allow Vercel to redeploy automatically.
5. Test one new employee account before inviting the wider workforce.

## Security Constraints
- Never expose the Supabase service-role/secret key to the browser.
- Signup cannot create Manager role.
- Approval state is database-controlled, not trusted from client metadata.
- Operational access requires ACTIVE status in database policy and RPC checks.
- Passwords remain exclusively in Supabase Auth.
- Employee directory is Manager-only.
- Audit events do not store credentials or tokens.

## Success Criteria
The feature is complete when an employee with any valid email can self-register, remain safely blocked while Pending, be approved by a Manager entirely within RadioOps, then use a simplified Check Out / Return interface without gaining any Manager capability; Managers can review and manage employee account states without using the Supabase dashboard for routine onboarding.
