# RadioOps Production — Employee Signup & Approval Edition

RadioOps is a shared 40-radio tracking system for WT-01 through WT-40. The production app uses Supabase Auth + PostgreSQL for identity, approvals, shared fleet data, and database-enforced authorization, with Vercel hosting the frontend.

## What this edition adds

- **Create Employee Account** directly from the RadioOps login page
- Any email address may register
- New accounts are forced to `EMPLOYEE` + `PENDING`
- Manager approval is required before fleet access
- Manager-only **Employees** page with Pending, Active, Disabled, and Rejected accounts
- Approve, reject, disable, and restore controls through protected database RPCs
- Simplified employee screen: **My Radio → Scan/Select → Check Out → Return**
- Pending, rejected, and disabled users are blocked by PostgreSQL RLS/RPC checks, not only by UI hiding
- Existing active production users, including the current Manager, are preserved

## Updating your existing live RadioOps site

Your current site already has the original production migration installed. **Do not run the first migration again.**

### Step 1 — Run the new Supabase migration

In **Supabase → SQL Editor → New query**, copy and run:

`supabase/migrations/202608230002_employee_signup_approval.sql`

This migration:

1. Adds approval/account-state fields to `profiles`.
2. Marks your existing active accounts as `ACTIVE` so your Manager login keeps working.
3. Adds a secure signup trigger for new Auth users.
4. Adds Manager-only approval/disable RPCs.
5. Updates RLS and checkout/return security to require `approval_status = 'ACTIVE'`.
6. Adds `profiles` to Supabase Realtime when available.

After it reports **Success**, do not manually create profile rows for new employees anymore. The signup trigger creates them automatically.

### Step 2 — Check Supabase email confirmation

Go to **Supabase → Authentication → Providers → Email** (the exact menu label may vary slightly).

Recommended workplace setting: keep **Confirm email** enabled. The employee flow then becomes:

`Create account → Verify email → Sign in → Pending Manager Approval → Manager Approves → Employee Access`

If email confirmation is disabled, signup can create a signed-in session immediately, but the employee is still safely held at the Pending approval screen.

### Step 3 — Upload the updated project to GitHub

Replace/update these project files in your existing `RadioOps` repository:

- `index.html`
- `styles.css`
- `src/app.js`
- `src/api.js`
- `src/permissions.js`
- `src/view-models.js`
- `supabase/migrations/202608230002_employee_signup_approval.sql`
- updated tests and this README

Keep your existing Vercel environment variables:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

The production page loads runtime configuration from `/api/runtime-config`. **Never place a Supabase service-role/secret key in the browser or Vercel public source.**

### Step 4 — Let Vercel redeploy

Because Vercel is connected to GitHub, committing these files to `main` should automatically create a new deployment. Wait for **Ready**, then open your existing site.

## Manager workflow

After signing in as Manager, use **Employees** in the left navigation.

- **Pending**: Approve or Reject new account requests.
- **Active**: See the employee, current radio, recent state, and disable access when needed.
- **Disabled**: Restore an employee's access.
- **Rejected**: Explicitly restore access if a rejected employee should later be allowed in.

RadioOps will refuse to disable an employee who still has a radio checked out. Return the radio first.

## Employee workflow

Employees never need Supabase or Vercel access.

1. Open your normal RadioOps URL.
2. Tap **Create Employee Account**.
3. Enter full name, Employee ID, department, email, and password.
4. Verify email if Supabase asks.
5. Sign in.
6. Wait on the **Account awaiting approval** screen.
7. After a Manager approves the account, tap **Refresh Status** or sign in again.
8. The employee sees only the simplified **My Radio** workspace.
9. Select or scan a radio and tap **Check Out**.
10. At the end of the shift, tap **Return My Radio**.

An employee with an open assignment cannot check out a second radio.

## Existing production foundation

The original migration remains:

`supabase/migrations/202608230001_radioops_production.sql`

It created the fleet schema, exactly 40 radios, assignments, audit events, charging states, and the original operational RPCs. A brand-new Supabase project must run `001` first and then `002`.

## Security model

- Signup metadata can provide only display name, employee ID, and department.
- The database trigger forces `role='EMPLOYEE'`, `approval_status='PENDING'`, and `is_active=false`.
- Employees cannot approve themselves or change their role/status.
- Only an active approved Manager can call employee-state administration RPCs.
- Pending/rejected/disabled users can read only their own profile status.
- Only active approved users can read radios/use checkout and return RPCs.
- Only Managers can read all employee profiles and audit events or manage repair/dock state.
- No service-role key is required or exposed.

## QR labels

Each radio QR code should contain only its permanent asset ID:

`WT-01` ... `WT-40`

The QR identifies the physical radio. Authentication and database authorization determine whether the checkout/return is allowed.

## Charging hardware note

RadioOps tracks charging state only. It does not control USB-C power. Verify the POC-1 Lite manufacturer's charging requirements before building a multi-radio power dock.

## Tests

```bash
npm test
```

The suite covers fleet behavior, API RPC contracts, approval migration safeguards, role/account gates, signup metadata, Manager employee administration surfaces, and the simplified employee workspace.

## Employee department
New self-registered employee accounts are automatically assigned to the **Valet Associate** department. Employees cannot change this value during signup. Manager accounts and existing manager departments are not modified.

## Manager promotion update
After the employee/Valet migrations have been applied, run:

`supabase/migrations/202608230004_manager_roles.sql`

This adds Manager promotion/demotion controls. Employee ID `1001` is marked as the protected Primary Manager during this migration. Active approved Valet Associate accounts can be promoted to `MANAGER` and `Management`; non-primary managers can be demoted back to `EMPLOYEE` and `Valet Associate`. The Primary Manager and the last remaining active Manager cannot be demoted.

## QR-verified employee returns

Migration `202608230005_qr_verified_returns.sql` changes employee returns so they must use the QR-verified return RPC. The employee UI requests browser camera permission, prefers the rear camera, verifies that the scanned WT code matches the radio currently assigned to the signed-in employee, and records `QR_VERIFIED_RETURN` in the audit log. Managers retain a `RADIO_RETURN_OVERRIDE` path for damaged or unavailable QR labels.

For camera access, deploy over HTTPS (Vercel does this automatically) and allow camera permission when the browser prompts. If permission was previously denied, re-enable Camera for the RadioOps site in the browser/site settings.
