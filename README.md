# RadioOps Production

RadioOps is a secure shared radio-fleet tracking application for WT-01 through WT-40. The production edition uses Supabase Auth + PostgreSQL for shared data and database-enforced authorization, with a Vercel-ready static frontend.

## Included

- Email/password sign-in through Supabase Auth
- Employee and Manager roles
- Shared 40-radio fleet state across devices
- Atomic checkout and return RPCs
- Employee self-checkout/self-return rules
- Manager checkout/return on behalf of employees
- Assignment history
- Repair state management
- Two 20-slot charging-bank status views
- Append-only audit events
- Realtime fleet refresh
- QR scanning with manual selection fallback
- Vercel runtime configuration endpoint

## 1. Create the Supabase backend

Create a Supabase project, then open **SQL Editor** and run:

`supabase/migrations/202608230001_radioops_production.sql`

The migration creates the production schema, RLS policies, RPC functions and exactly 40 radios (WT-01 through WT-40).

## 2. Create the first manager

In Supabase **Authentication > Users**, create a user with email/password. Copy the user's UUID and run:

```sql
insert into public.profiles (id, employee_id, display_name, department, role)
values ('AUTH-USER-UUID', '1001', 'Operations Manager', 'Management', 'MANAGER');
```

Create each employee in Supabase Auth, then add a matching profile:

```sql
insert into public.profiles (id, employee_id, display_name, department, role)
values ('AUTH-USER-UUID', '2042', 'Alex Morgan', 'Security', 'EMPLOYEE');
```

No employee passwords are stored in RadioOps tables.

## 3. Enable Realtime

In the Supabase dashboard, enable Realtime replication for:

- `public.radios`
- `public.assignments`

Realtime only triggers UI refreshes. Database responses remain the source of truth.

## 4. Run locally

Copy the values from `config.example.js` into `runtime-config.js` using your Supabase **Project URL** and **anon/publishable key**. Do not use the service-role key.

Then run a static server from the project directory:

```bash
python -m http.server 8080
```

Open `http://localhost:8080`.

Camera QR scanning generally requires HTTPS or localhost. Manual radio selection works without camera access.

## 5. Deploy to Vercel

Import this folder into Vercel and add these environment variables:

- `SUPABASE_URL` = your public Supabase Project URL
- `SUPABASE_ANON_KEY` = your public anon/publishable key

`vercel.json` rewrites `/runtime-config.js` to the serverless endpoint in `api/runtime-config.js`, which exposes only those public client values to the browser.

After deploying, add the production URL to the allowed redirect/site URLs in Supabase Authentication settings if required by your Auth configuration.

## 6. Production verification checklist

Before workplace use:

1. Sign in as a Manager and confirm all 40 radios load.
2. Sign in as an Employee on another device.
3. Check out a radio as the Employee and confirm the Manager screen updates.
4. Confirm the Employee cannot check a radio out to another employee.
5. Confirm the Employee cannot return another employee's radio.
6. Confirm a Manager can return a radio on behalf of an employee.
7. Put an available radio into Repair and restore it.
8. Change a charging-dock state as Manager.
9. Confirm Employee accounts cannot see the manager Audit Log.
10. Confirm audit events appear for checkout, return, repair and dock changes.
11. Confirm direct client table writes are denied by RLS.
12. Confirm no service-role key exists anywhere in browser source or Vercel public variables.

## Security model

Authorization is enforced in PostgreSQL, not just by hiding buttons. Employees may select their own profile and assignments and read radio fleet state. Managers can read fleet-wide profiles/assignments/audit events. Normal authenticated clients cannot directly insert/update/delete radios, assignments or audit rows; all operational mutations use SECURITY DEFINER RPC functions that validate the caller.

## QR labels

Each radio QR code should contain only its asset ID:

`WT-01` ... `WT-40`

Scanning a QR code identifies the radio but does not authorize the operation; the authenticated user and database policy do that.

## Charging hardware note

RadioOps tracks charging status only. It does not control USB-C power. Verify the POC-1 Lite manufacturer's charging voltage/current and USB-C requirements before building a multi-radio charging dock.

## Tests

Run:

```bash
npm test
```

The test suite covers the original fleet state logic plus production configuration, role behavior, backend API contracts and production UI structure.
