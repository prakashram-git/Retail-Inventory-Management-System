-- New role: ui_designer. A store-scoped role (like store_manager/cashier —
-- always has a non-null profiles.store_id) that can restyle the dashboard
-- and login/appearance branding for their own store, but has no access to
-- financial data, orders, inventory, staff, or other stores. super_admin
-- keeps full access, including the mall-wide (store_id IS NULL) defaults.
--
-- profiles.role is a real Postgres enum (public.user_role) — confirmed via
-- PostgREST's OpenAPI introspection before writing this, not assumed.
alter type public.user_role add value if not exists 'ui_designer';

-- ============================================================================
-- dashboard_layouts
-- ============================================================================
-- Stores a customizable widget arrangement + theme per store (or the mall
-- global default when store_id is null), optionally further overridden per
-- user (user_id set). The app only ever reads/writes the store-wide row
-- (user_id null) today — the per-user column exists for a future "personal
-- layout" feature and is left nullable/unused rather than removed, since the
-- unique constraint below already accommodates it.
create table if not exists public.dashboard_layouts (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references public.stores(id) on delete cascade, -- null = mall global default
  user_id uuid references public.profiles(id) on delete cascade, -- null = store/role-wide default
  layout_config jsonb not null default '[]'::jsonb,
  theme_config jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- Plain UNIQUE(store_id, user_id) would let multiple NULL/NULL (global
-- default) rows coexist, since standard SQL treats NULLs as distinct in a
-- unique constraint. Coalescing to a sentinel UUID in a unique index gets the
-- "at most one row per (store, user) scope, including the global scope"
-- guarantee portably, without depending on Postgres 15's NULLS NOT DISTINCT.
create unique index if not exists uq_dashboard_layouts_scope
  on public.dashboard_layouts (
    coalesce(store_id, '00000000-0000-0000-0000-000000000000'),
    coalesce(user_id, '00000000-0000-0000-0000-000000000000')
  );

alter table public.dashboard_layouts enable row level security;

-- Reading a layout is not sensitive (no financial data in it) — any
-- authenticated user may read any row, same posture as the read side of
-- products/categories in role_scoped_write_policies.sql. The app resolves
-- "the layout for my store, falling back to the global default" client-side
-- from whatever rows come back.
drop policy if exists dashboard_layouts_select on public.dashboard_layouts;
create policy dashboard_layouts_select
  on public.dashboard_layouts
  for select
  using (true);

-- Write access: super_admin (any store, including the global null row) or
-- ui_designer (their own store only — tightened beyond the original spec's
-- "IN ('super_admin','ui_designer')" because a store-scoped role must not be
-- able to overwrite another store's layout or the mall-wide default by
-- passing an arbitrary store_id).
drop policy if exists dashboard_layouts_insert on public.dashboard_layouts;
create policy dashboard_layouts_insert
  on public.dashboard_layouts
  for insert
  with check (
    get_auth_role() = 'super_admin'
    or (get_auth_role() = 'ui_designer' and store_id = get_auth_store_id())
  );

drop policy if exists dashboard_layouts_update on public.dashboard_layouts;
create policy dashboard_layouts_update
  on public.dashboard_layouts
  for update
  using (
    get_auth_role() = 'super_admin'
    or (get_auth_role() = 'ui_designer' and store_id = get_auth_store_id())
  )
  with check (
    get_auth_role() = 'super_admin'
    or (get_auth_role() = 'ui_designer' and store_id = get_auth_store_id())
  );

drop policy if exists dashboard_layouts_delete on public.dashboard_layouts;
create policy dashboard_layouts_delete
  on public.dashboard_layouts
  for delete
  using (
    get_auth_role() = 'super_admin'
    or (get_auth_role() = 'ui_designer' and store_id = get_auth_store_id())
  );

-- ============================================================================
-- system_settings: branding columns + ui_designer write access
-- ============================================================================
alter table public.system_settings add column if not exists app_logo_url text;
alter table public.system_settings add column if not exists favicon_url text;

-- The table's existing write policy (applied outside this repo, per
-- CLAUDE.md's note on untracked SQL objects) already permits super_admin and
-- store_manager; RLS combines multiple permissive policies for the same
-- command with OR, so this ADDS ui_designer without needing to know or touch
-- whatever that policy is actually named.
drop policy if exists system_settings_ui_designer_write on public.system_settings;
create policy system_settings_ui_designer_write
  on public.system_settings
  for update
  using (get_auth_role() = 'ui_designer' and store_id = get_auth_store_id())
  with check (get_auth_role() = 'ui_designer' and store_id = get_auth_store_id());

-- RLS can't restrict which *columns* a row-level policy allows — the policy
-- above lets a ui_designer UPDATE their store's system_settings row at all,
-- but the spec is explicit that they may only touch the branding/appearance
-- columns, not default_tax_rate (a financial setting) or store_id (identity).
-- A BEFORE UPDATE trigger enforces that column-level restriction for them
-- specifically; super_admin/store_manager are untouched by it.
create or replace function public.restrict_ui_designer_system_settings_columns()
returns trigger
language plpgsql
as $$
begin
  if get_auth_role() = 'ui_designer' then
    if new.store_id is distinct from old.store_id
      or new.default_tax_rate is distinct from old.default_tax_rate then
      raise exception 'ui_designer may only modify branding/appearance columns on system_settings';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_restrict_ui_designer_system_settings on public.system_settings;
create trigger trg_restrict_ui_designer_system_settings
  before update on public.system_settings
  for each row
  execute function public.restrict_ui_designer_system_settings_columns();
