-- Per-store terminal lock configuration (PRD: "Terminal Screen Lock, Inactivity
-- Timeouts, and Session Lifecycle Management", section 1/5 — config hierarchy +
-- bounded settings schema). Reuses system_settings (already store-scoped, already
-- has the ui_designer column-restriction trigger pattern in
-- add_ui_designer_role.sql) rather than introducing a parallel table.
--
-- inactivity_timeout_seconds is bounded [60, 900] at the DB layer (PCI DSS
-- v4.0 8.2.8: session timeout must be <= 15 minutes) as well as by the Zod
-- schema in lib/terminal-lock/settings.ts — defense in depth, since RLS/CHECK
-- is the real boundary per this repo's convention, not the app-layer form.
alter table public.system_settings
  add column if not exists inactivity_timeout_seconds int not null default 300
    constraint system_settings_inactivity_timeout_bounds check (inactivity_timeout_seconds between 60 and 900);
-- Defaults to off: locking after every single sale is unusually aggressive for
-- normal retail throughput. A super_admin opts a store in via Settings > Terminal Lock.
alter table public.system_settings
  add column if not exists lock_on_order_complete boolean not null default false;
-- Column may already exist (with the old default) on a database this file ran
-- against before; re-running must still land on the new default for new rows.
alter table public.system_settings
  alter column lock_on_order_complete set default false;
alter table public.system_settings
  add column if not exists lock_on_drawer_close boolean not null default true;

-- These three columns are a security control (unlike default_tax_rate, which
-- the existing table already protects from ui_designer edits) — restrict them
-- to super_admin only, blocking store_manager too even though system_settings'
-- pre-existing write policy already permits store_manager on the row as a
-- whole. Mirrors restrict_ui_designer_system_settings_columns() exactly, just
-- targeting a different role/column set.
create or replace function public.restrict_lock_settings_columns()
returns trigger
language plpgsql
as $$
begin
  if get_auth_role() <> 'super_admin' then
    if new.inactivity_timeout_seconds is distinct from old.inactivity_timeout_seconds
      or new.lock_on_order_complete is distinct from old.lock_on_order_complete
      or new.lock_on_drawer_close is distinct from old.lock_on_drawer_close then
      raise exception 'Only super_admin may modify terminal lock settings';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_restrict_lock_settings on public.system_settings;
create trigger trg_restrict_lock_settings
  before update on public.system_settings
  for each row
  execute function public.restrict_lock_settings_columns();
