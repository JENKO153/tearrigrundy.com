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
