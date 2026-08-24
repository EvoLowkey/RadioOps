# Supabase setup

1. Create a Supabase project and open **SQL Editor**.
2. Run `supabase/migrations/202608230001_radioops_production.sql` once.
3. In **Authentication > Users**, create the first manager account.
4. Copy that user's UUID and insert a linked profile from SQL Editor:

```sql
insert into public.profiles (id,employee_id,display_name,department,role)
values ('AUTH-USER-UUID','1001','Operations Manager','Management','MANAGER');
```

5. Create employee Auth users and matching `profiles` rows with role `EMPLOYEE`.
6. Enable Realtime replication for `radios` and `assignments` in the Supabase dashboard.
7. Put the public project URL and anon/publishable key into the Vercel environment variables `SUPABASE_URL` and `SUPABASE_ANON_KEY`.

Never place the Supabase service-role key in this frontend project.
