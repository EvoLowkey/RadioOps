# RadioOps Production Backend Design

## Goal
Upgrade the existing RadioOps local-first prototype into a production-ready shared workplace system using Supabase for authentication/database services and Vercel-compatible static hosting for the frontend.

## Existing Application
The current application already provides:
- WT-01 through WT-40 radio inventory.
- Checkout and return flows.
- Dashboard status counts.
- Assignment history.
- Repair state management.
- Two 20-slot charging-bank views.
- QR/manual radio selection.
- LocalStorage persistence.

The production upgrade preserves the existing professional UI and user flows while replacing browser-only state with authenticated shared data.

## Production Architecture

### Frontend
- Existing HTML/CSS/JavaScript RadioOps UI.
- Hosted as a static site on Vercel or another HTTPS-capable static host.
- Supabase JavaScript client is used directly from the browser.
- Only the public Supabase project URL and anon/publishable key are exposed in the frontend.
- Service-role credentials are never shipped to the browser.

### Backend
- Supabase PostgreSQL database.
- Supabase Auth for account sign-in.
- PostgreSQL Row Level Security (RLS) for authorization.
- Realtime subscriptions for fleet status updates across devices.

### Deployment
- Vercel hosts the frontend.
- Supabase hosts authentication and data.
- Production secrets/configuration are supplied via deployment environment configuration or a generated runtime config file that contains only public client values.

## Roles

### Employee
Employees can:
- Sign in.
- View the radio fleet status necessary to select an available radio.
- Check out an available radio to themselves.
- Return a radio currently assigned to themselves.
- View their own active assignment and assignment history.
- Scan/select radio IDs WT-01 through WT-40.

Employees cannot:
- Change another employee's assignment.
- Mark radios for repair or restore them to service.
- Edit dock status manually.
- View unrestricted employee/admin data.
- Modify or delete audit events.

### Manager
Managers can:
- View all radio assignments and history.
- Check out or return a radio on behalf of an employee.
- Mark radios in/out of repair.
- Update dock state.
- View fleet-wide employee assignment data.
- View audit events.
- Manage user role/profile fields where permitted by the application.

Managers cannot:
- Delete audit history through the normal UI.
- Bypass database security policies from the client.

## Authentication

### Sign-In
Initial production release uses email + password via Supabase Auth.

### Profile
Each authenticated user has a corresponding profile record with:
- auth user ID.
- employee ID.
- display name.
- department.
- role: EMPLOYEE or MANAGER.
- active/inactive state.

### Session Handling
- The Supabase client persists the auth session.
- The application shows the sign-in screen when no valid session exists.
- Signed-in users are routed to the appropriate workspace based on profile role.
- Sign-out clears the application session through Supabase Auth.

## Database Schema

### `profiles`
Purpose: workplace identity and authorization metadata linked to Supabase Auth.

Fields:
- `id uuid primary key references auth.users(id) on delete cascade`
- `employee_id text unique not null`
- `display_name text not null`
- `department text not null`
- `role text not null check (role in ('EMPLOYEE','MANAGER'))`
- `is_active boolean not null default true`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

### `radios`
Purpose: authoritative current state of the 40 radio assets.

Fields:
- `id text primary key` with values WT-01 through WT-40.
- `asset_number integer unique not null check (asset_number between 1 and 40)`
- `status text not null check (status in ('AVAILABLE','IN_USE','OVERDUE','REPAIR'))`
- `dock_slot integer unique not null check (dock_slot between 1 and 40)`
- `dock_state text not null check (dock_state in ('EMPTY','CHARGING','FULL','FAULT'))`
- `assigned_profile_id uuid null references profiles(id)`
- `checkout_at timestamptz null`
- `expected_return_at timestamptz null`
- `last_returned_at timestamptz null`
- `updated_at timestamptz not null default now()`

### `assignments`
Purpose: durable checkout/return history.

Fields:
- `id uuid primary key default gen_random_uuid()`
- `radio_id text not null references radios(id)`
- `profile_id uuid not null references profiles(id)`
- `employee_id_snapshot text not null`
- `employee_name_snapshot text not null`
- `department_snapshot text not null`
- `checkout_at timestamptz not null default now()`
- `expected_return_at timestamptz null`
- `return_at timestamptz null`
- `issued_by uuid not null references profiles(id)`
- `returned_by uuid null references profiles(id)`

Only one open assignment per radio is permitted. This is enforced with a partial unique index on `radio_id where return_at is null`.

### `audit_events`
Purpose: append-only operational accountability.

Fields:
- `id bigint generated always as identity primary key`
- `actor_profile_id uuid null references profiles(id)`
- `event_type text not null`
- `radio_id text null references radios(id)`
- `assignment_id uuid null references assignments(id)`
- `metadata jsonb not null default '{}'::jsonb`
- `created_at timestamptz not null default now()`

The normal client has no UPDATE or DELETE access to audit events.

## Transactional Operations

### Checkout Radio
Checkout must be an atomic database operation, implemented as a PostgreSQL RPC function rather than separate client-side writes.

The function:
1. Validates the caller is authenticated and active.
2. Resolves the target profile.
3. If caller is EMPLOYEE, target profile must equal caller.
4. Locks the radio row.
5. Requires radio status AVAILABLE.
6. Creates the assignment record.
7. Updates the radio to IN_USE, assigns profile, records checkout/expected return, and sets dock state EMPTY.
8. Inserts an audit event.
9. Returns the updated radio/assignment data.

This prevents two devices from checking out the same radio simultaneously.

### Return Radio
Return is also an RPC transaction.

The function:
1. Resolves the open assignment.
2. If caller is EMPLOYEE, assignment must belong to caller.
3. Closes the assignment.
4. Updates radio to AVAILABLE and dock state CHARGING.
5. Clears assigned profile and checkout fields.
6. Inserts an audit event.

### Repair Status
Manager-only RPC/action:
- AVAILABLE -> REPAIR sets dock state FAULT.
- REPAIR -> AVAILABLE restores service.
- Radio cannot enter repair while checked out.
- Audit event is inserted for both transitions.

### Dock Status
Manager-only update or RPC.
Allowed values: EMPTY, CHARGING, FULL, FAULT.
Each change creates an audit event.

## Overdue Handling
For the first production release, overdue status is calculated from `expected_return_at` in the UI and manager queries rather than depending on a background scheduler.

A database view or query exposes effective status:
- If stored status is IN_USE and `expected_return_at < now()`, effective status is OVERDUE.
- Otherwise effective status equals stored status.

A later scheduled job may persist OVERDUE if operationally necessary.

## Row Level Security
RLS is enabled on all application tables.

### Profiles
- Employees can SELECT their own profile.
- Managers can SELECT profiles needed for fleet management.
- Employees cannot change their own role.
- Role changes require manager-authorized server/database logic.

### Radios
- Authenticated active users may SELECT fleet radio state.
- Direct INSERT/UPDATE/DELETE from normal clients is denied.
- Mutations occur through SECURITY DEFINER RPC functions that validate caller role and business rules.

### Assignments
- Employees can SELECT their own assignments.
- Managers can SELECT all assignments.
- Direct mutations are denied; checkout/return RPC functions perform writes.

### Audit Events
- Managers can SELECT audit events.
- Employees do not receive fleet-wide audit logs.
- Direct client INSERT/UPDATE/DELETE is denied.
- RPC functions insert audit records.

## Realtime Behavior
The frontend subscribes to changes on:
- `radios`
- `assignments`

When another device checks out/returns/updates a radio, open dashboards refresh the affected state without requiring a manual page reload.

Realtime is an enhancement, not the source of truth. Every mutation is confirmed by the database response.

## Frontend Changes

### New Screens/States
- Sign-in screen.
- Signed-in user identity menu.
- Employee workspace mode.
- Manager workspace mode.
- Connection/error state banner.
- Loading/empty states sourced from backend data.

### Manager Dashboard
Retains current RadioOps design and includes:
- Fleet summary.
- Search/filter.
- Quick checkout/return.
- Radio detail drawer.
- Full assignment history.
- Repair controls.
- Charging banks.
- Audit log view.

### Employee Experience
Simplified workspace:
- Current assignment card.
- Available radios.
- Scan/select radio.
- Check out to self.
- Return own radio.
- Personal assignment history.

### LocalStorage
LocalStorage is no longer the authoritative production datastore.
It may be used only for non-sensitive UI preferences such as active tab/filter settings.

## QR Codes
Each radio QR value remains the asset ID:
- WT-01
- WT-02
- ...
- WT-40

The existing browser QR scanner is retained where supported, with manual selection fallback.

QR scanning does not authorize an operation by itself. The authenticated session and database policies authorize checkout/return.

## Error Handling
The frontend must distinguish:
- Authentication/session expired.
- Permission denied.
- Radio no longer available because another device checked it out.
- Attempt to return another employee's radio.
- Network/backend unavailable.
- Invalid radio QR code.
- Missing/inactive profile.

Failures must leave the UI consistent with server state. After a failed mutation, the relevant radio record is reloaded.

## Security Requirements
- HTTPS in production.
- No Supabase service-role key in frontend source or Vercel public variables.
- RLS enabled before production data is used.
- Authorization enforced in the database, not only by hidden buttons.
- Audit events append-only to normal application clients.
- User role is sourced from trusted profile data, not user-editable local state.
- Password reset uses Supabase Auth.
- No sensitive tokens are committed to the repository.

## Database Seed
Initial migration seeds exactly 40 radios:
- WT-01 through WT-40.
- asset_number 1 through 40.
- dock_slot 1 through 40.
- status AVAILABLE.
- dock_state FULL.

No production employee accounts are hard-coded into migrations.

## Configuration
Frontend configuration contains:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

Development supports a local config file excluded from Git.
Production receives the public values through the deployment environment/build process.

## Testing

### Unit Tests
- Radio ID validation.
- View-model role behavior.
- Effective overdue status.
- UI permission helpers.

### Database/Integration Tests
Using a test Supabase project or local Supabase environment:
- Employee can check out an available radio to self.
- Employee cannot check out to another profile.
- Concurrent checkout cannot create two open assignments.
- Employee can return own radio.
- Employee cannot return another employee's radio.
- Manager can issue/return on behalf of employees.
- Repair transitions enforce rules.
- Direct client updates blocked by RLS.
- Employee cannot read all assignment/audit records.
- Manager can read fleet assignment/audit data.
- Audit events are generated for operations.

### Frontend Smoke Tests
- Sign-in state.
- Manager dashboard loads 40 radios from backend.
- Employee workspace hides manager actions.
- Checkout/return error messages are rendered.
- Realtime refresh handler updates fleet state.

## Deployment Workflow
1. Create Supabase project.
2. Run SQL migrations and seed radios.
3. Create first manager user through Supabase Auth/admin workflow.
4. Insert/link manager profile.
5. Configure frontend public Supabase values.
6. Deploy frontend to Vercel.
7. Add approved custom domain if desired.
8. Test manager and employee flows in production.
9. Print/apply WT-01 through WT-40 QR labels.

## Not Included in This Production Upgrade
- Custom USB-C electrical charging controller.
- Device-level GPS/Bluetooth/UWB physical location tracking.
- Payroll/HR integrations.
- SSO/SAML.
- SMS notifications.
- Automated badge-reader hardware integration.

These can be added later without changing the core radio/assignment model.

## Success Criteria
RadioOps is production-ready for initial workplace use when:
- Multiple authenticated devices see the same radio state.
- Employee and manager permissions are enforced by database RLS/RPC rules.
- Checkouts and returns are atomic and auditable.
- All 40 radios are represented in shared storage.
- Existing professional dashboard functions against backend data.
- Employees can only manage their own assignments.
- Managers can administer fleet operations.
- No privileged backend credential exists in frontend code.
- The application can be deployed via documented Supabase + Vercel steps.
