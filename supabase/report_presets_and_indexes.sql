-- Foundation table for a future custom-report-builder UI (column selection,
-- filters, grouping, saved per user) — no consuming feature built yet, this
-- is schema only, applied ahead of that UI at the user's request.
create table if not exists public.user_report_presets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  store_id uuid references public.stores(id) on delete cascade,
  report_id text not null,
  name text not null,
  selected_columns text[] not null default '{}',
  filters jsonb not null default '{}'::jsonb,
  group_by text,
  is_default boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.user_report_presets enable row level security;

create policy "presets_user_access" on public.user_report_presets
  for all using (user_id = auth.uid() or get_auth_role() = 'super_admin');

-- Performance indexes ahead of a planned expansion to 24+ report views.
create index if not exists idx_orders_reporting_composite
  on public.orders(store_id, status, created_at desc)
  include (subtotal, tax, discount, total, payment_method);

create index if not exists idx_order_items_reporting
  on public.order_items(product_id, order_id)
  include (quantity, unit_price, subtotal, refunded_quantity, unit_cost);

create index if not exists idx_inventory_logs_reporting
  on public.inventory_logs(store_id, change_type, created_at desc);
