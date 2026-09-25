# Tearri Grundy — admin security

The dashboard lives at `/admin/login/` (it is not linked anywhere on the public site).

## What protects it
- **One owner login** (Supabase Auth). Signing up is not possible; the owner account is created by hand.
- **Password re-check** before every publish, live-post edit, delete or page-content save. With `02-security.sql` the *database* enforces it, not just the page.
- **Auto sign-out** after 5 minutes idle; the session lives in `sessionStorage`, so closing the browser signs out.
- **Two-step sign-in** (authenticator app) — set up from Security in the dashboard.
- **Permanent activity log** of every change (append-only).
- Admin pages ship a strict Content-Security-Policy and refuse to be framed.
- Photos are re-encoded to WebP in the browser (strips location data) and only sensible file names are accepted.

## Setting it up (once)
1. Supabase → SQL Editor → run `supabase/01-dashboard.sql` (drafts, page-content editing).
2. Authentication → Providers: turn **off** "Allow new users to sign up".
3. Edit the email at the bottom of `supabase/02-security.sql`, then run it.
4. Sign in, open **Security**, and set up the authenticator app.
5. Then run: `update public.security_settings set require_mfa = true where id = 1;`

If you get locked out, add yourself again in the SQL Editor:
`insert into public.admins (user_id, email) select id, email from auth.users where email = 'you@example.com' on conflict do nothing;`

## Things that are deliberately not here
- No "forgot password" page (reset from the Supabase dashboard).
- The anon key in `js/config.js` is meant to be public; the `service_role` key must never be added to this repo.
