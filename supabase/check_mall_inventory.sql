-- Not yet applied to any environment. The POS terminal's "Inspect Sister
-- Stores" feature (lib/pos/mall-inventory.ts) calls this RPC by name and
-- degrades gracefully if it's missing, but needs this (or an equivalent
-- function with the same name/args/return shape) applied to actually work.
--
-- Run this against the project's Supabase database (SQL editor or `supabase
-- db push`) once the assumed contract below matches what you want.
create or replace function public.check_mall_inventory(
  p_sku text,
  p_exclude_store_id uuid
)
returns table (
  store_id uuid,
  store_name text,
  unit_number text,
  floor_number text,
  current_stock integer,
  retail_price numeric
)
language sql
security definer
set search_path = public
as $$
  select
    s.id as store_id,
    s.name as store_name,
    s.unit_number,
    s.floor_number,
    p.current_stock,
    p.retail_price
  from products p
  join stores s on s.id = p.store_id
  where p.sku = p_sku
    and p.store_id <> p_exclude_store_id
    and p.is_active
    and s.is_active
  order by p.current_stock desc;
$$;

grant execute on function public.check_mall_inventory(text, uuid) to authenticated;
