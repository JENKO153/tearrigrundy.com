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

