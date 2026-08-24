# Valet Ops HQ Production Checklist

- Confirm Supabase backups and recovery settings are appropriate for the workplace.
- Monitor Supabase database/auth usage, Vercel usage, and Resend email limits.
- Keep Manager accounts limited to authorized leaders and review them periodically.
- Review Lost, Damaged, and In Repair radios plus open assignments at least once per shift/day.
- Test signup, email verification, Manager approval, Forgot Password, checkout, QR return, and employee removal after major deployments.
- Keep `SUPABASE_SERVICE_ROLE_KEY` only in Vercel server-side environment variables; never commit it to GitHub.
- Keep the public Supabase URL/anon key in runtime configuration only; rely on RLS/RPC authorization.
