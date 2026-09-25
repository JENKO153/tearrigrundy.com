-- =====================================================================
-- EVERYTHING in one file, in the right order. Safe to run again at any time.
--   1. Dashboard upgrade   (drafts, take-down, editable page content)
--   2. Security upgrade    (admins list, password re-check, activity log)
--   3. Earnings            (private manual figures)
-- Paste the whole thing into Supabase -> SQL Editor -> Run.
-- =====================================================================

-- ##################### PART 1 of 3 #####################
-- =====================================================================
-- 01 · Dashboard upgrade  (safe to run more than once)
-- Run this in Supabase -> SQL Editor. It ONLY adds things; nothing is removed or locked down.
--   * Drafts saved online (posts.status)
--   * updated_at on posts
--   * Homepage & About editable content (site_settings)
-- =====================================================================

-- Drafts + "last edited"
alter table public.posts add column if not exists status text not null default 'published';
alter table public.posts drop constraint if exists posts_status_check;
alter table public.posts add constraint posts_status_check check (status in ('draft', 'published'));
alter table public.posts add column if not exists updated_at timestamptz not null default now();

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end $$;
drop trigger if exists posts_touch on public.posts;
create trigger posts_touch before update on public.posts for each row execute function public.touch_updated_at();

-- Visitors only ever see published posts whose time has come. Signed-in owner sees everything.
drop policy if exists "Public can read posts" on public.posts;
create policy "Public can read posts" on public.posts for select
  using ((status = 'published' and published_at <= now()) or auth.role() = 'authenticated');

-- Editable wording/photos for the Homepage, About, Blog banner and Contact sections.
create table if not exists public.site_settings (
  id int primary key default 1 check (id = 1),
  data jsonb not null default '{}'::jsonb check (octet_length(data::text) < 100000),
  updated_at timestamptz not null default now()
);
insert into public.site_settings (id) values (1) on conflict (id) do nothing;
alter table public.site_settings enable row level security;

drop trigger if exists site_settings_touch on public.site_settings;
create trigger site_settings_touch before update on public.site_settings for each row execute function public.touch_updated_at();

drop policy if exists "Public can read site settings" on public.site_settings;
create policy "Public can read site settings" on public.site_settings for select using (true);
drop policy if exists "Owner can add site settings" on public.site_settings;
create policy "Owner can add site settings" on public.site_settings for insert to authenticated with check (true);
drop policy if exists "Owner can edit site settings" on public.site_settings;
create policy "Owner can edit site settings" on public.site_settings for update to authenticated using (true) with check (true);

-- ##################### PART 2 of 3 #####################
-- =====================================================================
-- 02 · Security upgrade  (run AFTER 01-dashboard.sql; safe to run more than once)
-- Makes the DATABASE enforce what the dashboard already asks for:
--   * only people on the admins list can change anything
--   * every publish / edit / delete needs a password check in the last few minutes
--   * authenticator-app (2-step) sign-in
--   * a permanent activity log
--
-- BEFORE running: create your login in Authentication -> Users (if you haven't), then
-- edit the email on the LAST statement of this file, so you are on the admins list.
-- If you forget, the dashboard will lock you out until you add yourself (see the bottom).
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now()
);
create table if not exists public.security_settings (
  id int primary key default 1 check (id = 1),
  require_mfa boolean not null default true,
  confirm_window_minutes int not null default 5 check (confirm_window_minutes between 1 and 30),
  max_failed_confirms int not null default 5 check (max_failed_confirms between 3 and 20)
);
-- Starts with the 2-step code OPTIONAL so you can't lock yourself out. Once you have set it up
-- in the dashboard (Security page), make it compulsory with:
--   update public.security_settings set require_mfa = true where id = 1;
insert into public.security_settings (id, require_mfa) values (1, false) on conflict (id) do nothing;

create table if not exists public.admin_write_grants (
  user_id uuid primary key references auth.users(id) on delete cascade,
  session_id uuid,
  expires_at timestamptz not null
);
create table if not exists public.admin_confirm_attempts (
  id bigserial primary key,
  user_id uuid not null,
  success boolean not null,
  at timestamptz not null default now()
);
create index if not exists admin_confirm_attempts_user_at_idx on public.admin_confirm_attempts (user_id, at desc);

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;
create or replace function public.mfa_ok() returns boolean
language sql stable security definer set search_path = public as $$
  select not coalesce((select require_mfa from public.security_settings where id = 1), true)
      or coalesce(auth.jwt() ->> 'aal', '') = 'aal2';
$$;
create or replace function public.admin_ok() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() and public.mfa_ok();
$$;
create or replace function public.can_write() returns boolean
language sql stable security definer set search_path = public as $$
  select public.admin_ok() and exists (
    select 1 from public.admin_write_grants g
    where g.user_id = auth.uid() and g.expires_at > now()
      and g.session_id is not distinct from nullif(auth.jwt() ->> 'session_id', '')::uuid
  );
$$;

create or replace function public.confirm_password(password text) returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  uid uuid := auth.uid(); hash text; fails int; cfg public.security_settings; exp timestamptz;
begin
  if uid is null or not public.is_admin() then return jsonb_build_object('ok', false, 'reason', 'not_admin'); end if;
  if not public.mfa_ok() then return jsonb_build_object('ok', false, 'reason', 'mfa_required'); end if;
  select * into cfg from public.security_settings where id = 1;
  select count(*) into fails from public.admin_confirm_attempts
    where user_id = uid and not success and at > now() - interval '15 minutes';
  if fails >= cfg.max_failed_confirms then return jsonb_build_object('ok', false, 'reason', 'locked'); end if;
  select encrypted_password into hash from auth.users where id = uid;
  if hash is null or password is null or extensions.crypt(password, hash) <> hash then
    insert into public.admin_confirm_attempts (user_id, success) values (uid, false);
    return jsonb_build_object('ok', false, 'reason', 'incorrect', 'remaining', cfg.max_failed_confirms - fails - 1);
  end if;
  insert into public.admin_confirm_attempts (user_id, success) values (uid, true);
  exp := now() + make_interval(mins => cfg.confirm_window_minutes);
  insert into public.admin_write_grants (user_id, session_id, expires_at)
  values (uid, nullif(auth.jwt() ->> 'session_id', '')::uuid, exp)
  on conflict (user_id) do update set session_id = excluded.session_id, expires_at = excluded.expires_at;
  return jsonb_build_object('ok', true, 'expires_at', exp);
end;
$$;
create or replace function public.end_write_grant() returns void
language sql volatile security definer set search_path = public as $$
  delete from public.admin_write_grants where user_id = auth.uid();
$$;
create or replace function public.admin_status() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'is_admin', public.is_admin(),
    'require_mfa', coalesce((select require_mfa from public.security_settings where id = 1), true),
    'aal', coalesce(auth.jwt() ->> 'aal', 'aal1'));
$$;
revoke all on function public.confirm_password(text) from public, anon;
revoke all on function public.end_write_grant() from public, anon;
revoke all on function public.admin_status() from public, anon;
grant execute on function public.confirm_password(text) to authenticated;
grant execute on function public.end_write_grant() to authenticated;
grant execute on function public.admin_status() to authenticated;

-- Permanent record of every change (nobody can edit or remove entries; only the trigger adds them)
create table if not exists public.audit_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  user_id uuid, email text,
  action text not null, entity text not null, entity_id text, summary text
);
create index if not exists audit_log_at_idx on public.audit_log (at desc);
create or replace function public.log_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare rec jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
  insert into public.audit_log (user_id, email, action, entity, entity_id, summary)
  values (auth.uid(), auth.jwt() ->> 'email', lower(tg_op), tg_table_name, rec ->> 'id',
          left(coalesce(rec ->> 'title', case when tg_table_name = 'site_settings' then 'Homepage & About content' end, rec ->> 'slug', ''), 200));
  return null;
end;
$$;
drop trigger if exists posts_audit on public.posts;
create trigger posts_audit after insert or update or delete on public.posts for each row execute function public.log_change();
drop trigger if exists site_settings_audit on public.site_settings;
create trigger site_settings_audit after update on public.site_settings for each row execute function public.log_change();

-- ---------- Row-level security: only admins, only after a password check ----------
alter table public.admins enable row level security;
alter table public.security_settings enable row level security;
alter table public.admin_write_grants enable row level security;
alter table public.admin_confirm_attempts enable row level security;
alter table public.audit_log enable row level security;
revoke all on public.admin_write_grants, public.admin_confirm_attempts from anon, authenticated;
revoke insert, update, delete, truncate on public.audit_log from anon, authenticated;
revoke insert, update, delete, truncate on public.posts, public.site_settings from anon;

drop policy if exists admins_self_read on public.admins;
create policy admins_self_read on public.admins for select to authenticated using (user_id = auth.uid());
drop policy if exists security_settings_admin_read on public.security_settings;
create policy security_settings_admin_read on public.security_settings for select to authenticated using (public.is_admin());
drop policy if exists audit_log_read on public.audit_log;
create policy audit_log_read on public.audit_log for select to authenticated using (public.admin_ok());

-- posts: the public sees published posts whose time has come; the admin sees everything.
drop policy if exists "Public can read posts" on public.posts;
create policy "Public can read posts" on public.posts for select to anon, authenticated
  using ((status = 'published' and published_at <= now()) or public.admin_ok());
drop policy if exists "Logged in user can add posts" on public.posts;
drop policy if exists "Logged in user can edit posts" on public.posts;
drop policy if exists "Logged in user can delete posts" on public.posts;
-- Drafts can be saved without re-typing the password; anything touching a live post needs it.
drop policy if exists posts_insert on public.posts;
create policy posts_insert on public.posts for insert to authenticated
  with check (public.admin_ok() and (status = 'draft' or public.can_write()));
drop policy if exists posts_update on public.posts;
create policy posts_update on public.posts for update to authenticated
  using (public.admin_ok() and (status = 'draft' or public.can_write()))
  with check (public.admin_ok() and (status = 'draft' or public.can_write()));
drop policy if exists posts_delete on public.posts;
create policy posts_delete on public.posts for delete to authenticated using (public.can_write());

-- site content
drop policy if exists "Owner can add site settings" on public.site_settings;
drop policy if exists "Owner can edit site settings" on public.site_settings;
drop policy if exists site_settings_insert on public.site_settings;
create policy site_settings_insert on public.site_settings for insert to authenticated with check (public.can_write());
drop policy if exists site_settings_update on public.site_settings;
create policy site_settings_update on public.site_settings for update to authenticated using (public.can_write()) with check (public.can_write());

-- photos: adding needs the admin; removing needs the password check; only sensible file names
drop policy if exists "Logged in user can upload post images" on storage.objects;
drop policy if exists "Logged in user can delete post images" on storage.objects;
drop policy if exists post_images_insert on storage.objects;
create policy post_images_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'post-images' and public.admin_ok() and name ~ '^(posts|site)/[a-f0-9-]+\.webp$');
drop policy if exists post_images_delete on storage.objects;
create policy post_images_delete on storage.objects for delete to authenticated
  using (bucket_id = 'post-images' and public.can_write());
update storage.buckets set file_size_limit = 8388608,
  allowed_mime_types = array['image/webp', 'image/jpeg', 'image/png', 'image/avif']
where id = 'post-images';

-- ##################### PART 3 of 3 #####################
-- =====================================================================
-- 03 · Earnings (run AFTER 02-security.sql; safe to run more than once)
-- Private table for monthly figures typed in by hand (used for AdSense, or anything without a live
-- feed). Money figures are private: only signed-in admins can read them, and saving needs a
-- recent password check. The public website can never read this table.
-- =====================================================================
create table if not exists public.earnings_manual (
  month text not null check (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  platform text not null check (platform in ('adsense', 'stay22', 'travelpayouts', 'other')),
  amount numeric(12, 2) not null check (amount >= 0 and amount < 10000000),
  currency text not null default 'AUD' check (currency ~ '^[A-Z]{3}$'),
  updated_at timestamptz not null default now(),
  primary key (month, platform)
);
alter table public.earnings_manual enable row level security;
revoke all on public.earnings_manual from anon;

drop policy if exists earnings_manual_read on public.earnings_manual;
create policy earnings_manual_read on public.earnings_manual for select to authenticated using (public.admin_ok());
drop policy if exists earnings_manual_insert on public.earnings_manual;
create policy earnings_manual_insert on public.earnings_manual for insert to authenticated with check (public.can_write());
drop policy if exists earnings_manual_update on public.earnings_manual;
create policy earnings_manual_update on public.earnings_manual for update to authenticated using (public.can_write()) with check (public.can_write());
drop policy if exists earnings_manual_delete on public.earnings_manual;
create policy earnings_manual_delete on public.earnings_manual for delete to authenticated using (public.can_write());

drop trigger if exists earnings_manual_touch on public.earnings_manual;
create trigger earnings_manual_touch before update on public.earnings_manual for each row execute function public.touch_updated_at();

-- ##################### WHO IS ALLOWED IN #####################
-- Anyone listed here (who already has a login under Authentication -> Users) is an admin.
insert into public.admins (user_id, email)
select id, email from auth.users
where email in ('admin.tearrigrundy@gmail.com', 'kurtjenkins@seventhboar.com')
on conflict (user_id) do nothing;

-- Shows who is on the list (one row per person, if their logins exist):
select email from public.admins;
