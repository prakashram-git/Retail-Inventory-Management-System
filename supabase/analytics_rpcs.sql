-- Three read-only analytics RPCs. Deliberately NOT security definer — these
-- are pure aggregation reads with no privileged writes, so they run as the
-- calling user and inherit the ordinary SELECT RLS policies on
-- orders/order_items/products/cash_drawer_sessions (tenant-isolated, open to
-- any authenticated role) exactly like every other read in this app. The
-- Next.js server actions that call these still gate *which roles* may reach
-- them (super_admin/store_manager only) — RLS here just guarantees a
-- store_manager can never see another store's numbers even if that check
-- were bypassed.

-- ============================================================================
-- get_daily_monthly_digest
-- ============================================================================
create or replace function public.get_daily_monthly_digest(p_store_id uuid, p_target_date date)
returns jsonb
language plpgsql
stable
as $$
declare
  v_timezone text;
  v_day_of_month int := extract(day from p_target_date)::int;
  v_days_in_month int := extract(day from (date_trunc('month', p_target_date) + interval '1 month - 1 day'))::int;

  v_prior_month_start date := (date_trunc('month', p_target_date - interval '1 month'))::date;
  v_prior_month_days int := extract(day from (date_trunc('month', v_prior_month_start) + interval '1 month - 1 day'))::int;
  v_prior_month_span_days int := least(v_day_of_month, v_prior_month_days);

  -- Order-level and item-level aggregates are queried independently per
  -- period (not joined) — joining order_items onto orders in one query would
  -- duplicate each order's subtotal/total/discount/tax once per line item,
  -- inflating every order-level sum by however many items were on the order.
  v_today_orders record;
  v_today_items record;
  v_yesterday_orders record;
  v_last_week_orders record;
  v_mtd_orders record;
  v_mtd_items record;
  v_mtd_prior_orders record;

  v_aov numeric; v_upt numeric; v_gross_profit numeric; v_gross_margin_pct numeric; v_discount_leakage_pct numeric;
  v_dod_pct numeric; v_wow_pct numeric;
  v_mtd_gross_margin_pct numeric; v_mtd_refunds_total numeric; v_projected_month_end numeric; v_mom_pct numeric;

  v_today_start timestamptz; v_today_end timestamptz;
  v_mtd_start timestamptz; v_mtd_prior_end timestamptz;
begin
  select timezone into v_timezone from stores where id = p_store_id;
  v_timezone := coalesce(v_timezone, 'UTC');

  -- Each window's bounds are computed from `date AT TIME ZONE v_timezone`,
  -- which correctly converts a *local* calendar day into the right UTC
  -- instant range so an order at 23:30 local time is never miscredited to
  -- the next UTC day.
  v_today_start := (p_target_date::timestamp AT TIME ZONE v_timezone);
  v_today_end := ((p_target_date + 1)::timestamp AT TIME ZONE v_timezone);
  v_mtd_start := (date_trunc('month', p_target_date)::date::timestamp AT TIME ZONE v_timezone);
  v_mtd_prior_end := ((v_prior_month_start + v_prior_month_span_days)::timestamp AT TIME ZONE v_timezone);

  select
    coalesce(sum(o.subtotal), 0) as gross_sales,
    coalesce(sum(o.total), 0) as net_sales,
    count(*) as order_count,
    coalesce(sum(o.discount), 0) as discount_total,
    coalesce(sum(o.tax), 0) as tax_collected
  into v_today_orders
  from orders o
  where o.store_id = p_store_id and o.status <> 'voided'
    and o.created_at >= v_today_start and o.created_at < v_today_end;

  select
    coalesce(sum(oi.quantity - oi.refunded_quantity), 0) as total_items,
    coalesce(sum((oi.quantity - oi.refunded_quantity) * oi.unit_cost), 0) as cogs
  into v_today_items
  from order_items oi
  join orders o on o.id = oi.order_id
  where o.store_id = p_store_id and o.status <> 'voided'
    and o.created_at >= v_today_start and o.created_at < v_today_end;

  select coalesce(sum(o.total), 0) as net_sales into v_yesterday_orders
  from orders o
  where o.store_id = p_store_id and o.status <> 'voided'
    and o.created_at >= ((p_target_date - 1)::timestamp AT TIME ZONE v_timezone)
    and o.created_at < v_today_start;

  select coalesce(sum(o.total), 0) as net_sales into v_last_week_orders
  from orders o
  where o.store_id = p_store_id and o.status <> 'voided'
    and o.created_at >= ((p_target_date - 7)::timestamp AT TIME ZONE v_timezone)
    and o.created_at < ((p_target_date - 6)::timestamp AT TIME ZONE v_timezone);

  select coalesce(sum(o.total), 0) as net_sales into v_mtd_orders
  from orders o
  where o.store_id = p_store_id and o.status <> 'voided'
    and o.created_at >= v_mtd_start and o.created_at < v_today_end;

  select
    coalesce(sum((oi.quantity - oi.refunded_quantity) * oi.unit_cost), 0) as cogs,
    coalesce(sum(oi.refunded_quantity * oi.unit_price), 0) as refunds_total
  into v_mtd_items
  from order_items oi
  join orders o on o.id = oi.order_id
  where o.store_id = p_store_id and o.status <> 'voided'
    and o.created_at >= v_mtd_start and o.created_at < v_today_end;

  select coalesce(sum(o.total), 0) as net_sales into v_mtd_prior_orders
  from orders o
  where o.store_id = p_store_id and o.status <> 'voided'
    and o.created_at >= (v_prior_month_start::timestamp AT TIME ZONE v_timezone)
    and o.created_at < v_mtd_prior_end;

  v_aov := round(coalesce(v_today_orders.net_sales / nullif(v_today_orders.order_count, 0), 0.00), 2);
  v_upt := round(coalesce(v_today_items.total_items::numeric / nullif(v_today_orders.order_count, 0), 0.00), 2);
  v_gross_profit := v_today_orders.net_sales - v_today_items.cogs;
  v_gross_margin_pct := round(coalesce(((v_today_orders.net_sales - v_today_items.cogs) / nullif(v_today_orders.net_sales, 0)) * 100.0, 0.00), 2);
  v_discount_leakage_pct := round(coalesce((v_today_orders.discount_total / nullif(v_today_orders.gross_sales, 0)) * 100.0, 0.00), 2);
  v_dod_pct := round(coalesce(((v_today_orders.net_sales - v_yesterday_orders.net_sales) / nullif(v_yesterday_orders.net_sales, 0)) * 100.0, 0.00), 2);
  v_wow_pct := round(coalesce(((v_today_orders.net_sales - v_last_week_orders.net_sales) / nullif(v_last_week_orders.net_sales, 0)) * 100.0, 0.00), 2);

  v_mtd_gross_margin_pct := round(coalesce(((v_mtd_orders.net_sales - v_mtd_items.cogs) / nullif(v_mtd_orders.net_sales, 0)) * 100.0, 0.00), 2);
  v_mtd_refunds_total := round(v_mtd_items.refunds_total, 2);
  v_projected_month_end := round(coalesce((v_mtd_orders.net_sales / nullif(v_day_of_month, 0)) * v_days_in_month, 0.00), 2);
  v_mom_pct := round(coalesce(((v_mtd_orders.net_sales - v_mtd_prior_orders.net_sales) / nullif(v_mtd_prior_orders.net_sales, 0)) * 100.0, 0.00), 2);

  return jsonb_build_object(
    'target_date', p_target_date,
    'timezone', v_timezone,
    'daily', jsonb_build_object(
      'gross_sales', round(v_today_orders.gross_sales, 2),
      'net_sales', round(v_today_orders.net_sales, 2),
      'order_count', v_today_orders.order_count,
      'aov', v_aov,
      'upt', v_upt,
      'cogs', round(v_today_items.cogs, 2),
      'gross_profit', round(v_gross_profit, 2),
      'gross_margin_pct', v_gross_margin_pct,
      'discount_total', round(v_today_orders.discount_total, 2),
      'discount_leakage_pct', v_discount_leakage_pct,
      'tax_collected', round(v_today_orders.tax_collected, 2),
      'dod_delta_pct', v_dod_pct,
      'wow_delta_pct', v_wow_pct
    ),
    'mtd', jsonb_build_object(
      'net_sales', round(v_mtd_orders.net_sales, 2),
      'cogs', round(v_mtd_items.cogs, 2),
      'gross_margin_pct', v_mtd_gross_margin_pct,
      'refunds_total', v_mtd_refunds_total,
      'projected_month_end', v_projected_month_end,
      'mom_growth_pct', v_mom_pct,
      'days_elapsed', v_day_of_month,
      'days_in_month', v_days_in_month
    )
  );
end;
$$;

grant execute on function public.get_daily_monthly_digest(uuid, date) to authenticated;

-- ============================================================================
-- get_cashier_performance_metrics
-- ============================================================================
create or replace function public.get_cashier_performance_metrics(p_store_id uuid, p_start_date timestamptz, p_end_date timestamptz)
returns table (
  cashier_id uuid,
  cashier_name text,
  role text,
  total_sales_volume numeric,
  transaction_count integer,
  total_hours_worked numeric,
  splh numeric,
  average_ticket_size numeric,
  total_units integer,
  items_per_transaction numeric,
  discount_frequency_rate numeric,
  void_count integer,
  refund_count integer,
  refund_amount numeric,
  net_drawer_discrepancy numeric,
  risk_score text
)
language plpgsql
stable
as $$
begin
  return query
  with relevant_cashiers as (
    select distinct o.cashier_id as id from orders o
      where o.store_id = p_store_id and o.created_at >= p_start_date and o.created_at < p_end_date
    union
    select distinct s.cashier_id as id from cash_drawer_sessions s
      where s.store_id = p_store_id and s.opened_at >= p_start_date and s.opened_at < p_end_date
  ),
  order_agg as (
    select
      o.cashier_id,
      sum(o.total) filter (where o.status <> 'voided') as total_sales_volume,
      count(*) filter (where o.status <> 'voided') as transaction_count,
      count(*) filter (where o.status = 'voided') as void_count,
      count(*) filter (where o.status in ('refunded', 'partially_refunded')) as refund_count,
      count(*) filter (where o.status <> 'voided' and o.discount > 0) as discounted_count
    from orders o
    where o.store_id = p_store_id and o.created_at >= p_start_date and o.created_at < p_end_date
    group by o.cashier_id
  ),
  item_agg as (
    select
      o.cashier_id,
      sum(oi.quantity) filter (where o.status <> 'voided') as total_units,
      sum(oi.refunded_quantity * oi.unit_price) as refund_amount
    from order_items oi
    join orders o on o.id = oi.order_id
    where o.store_id = p_store_id and o.created_at >= p_start_date and o.created_at < p_end_date
    group by o.cashier_id
  ),
  session_agg as (
    select
      s.cashier_id,
      sum(extract(epoch from (coalesce(s.closed_at, now()) - s.opened_at)) / 3600.0) as total_hours_worked,
      sum(coalesce(s.discrepancy, 0)) as net_drawer_discrepancy
    from cash_drawer_sessions s
    where s.store_id = p_store_id and s.opened_at >= p_start_date and s.opened_at < p_end_date
    group by s.cashier_id
  )
  select
    rc.id,
    coalesce(p.full_name, p.email, 'Unknown'),
    p.role::text,
    coalesce(oa.total_sales_volume, 0),
    coalesce(oa.transaction_count, 0)::int,
    coalesce(sa.total_hours_worked, 0),
    round(coalesce(oa.total_sales_volume / nullif(sa.total_hours_worked, 0), 0.00), 2),
    round(coalesce(oa.total_sales_volume / nullif(oa.transaction_count, 0), 0.00), 2),
    coalesce(ia.total_units, 0)::int,
    round(coalesce(ia.total_units::numeric / nullif(oa.transaction_count, 0), 0.00), 2),
    round(coalesce(oa.discounted_count::numeric / nullif(oa.transaction_count, 0), 0.00) * 100.0, 2),
    coalesce(oa.void_count, 0)::int,
    coalesce(oa.refund_count, 0)::int,
    round(coalesce(ia.refund_amount, 0), 2),
    round(coalesce(sa.net_drawer_discrepancy, 0), 2),
    -- Underspecified in the brief beyond the three trigger conditions: 2+
    -- triggered => high, exactly 1 => medium, none => low.
    case
      when (
        (case when oa.transaction_count > 0 and (oa.discounted_count::numeric / oa.transaction_count) > 0.20 then 1 else 0 end) +
        (case when coalesce(oa.void_count, 0) > 3 then 1 else 0 end) +
        (case when abs(coalesce(sa.net_drawer_discrepancy, 0)) > 15.00 then 1 else 0 end)
      ) >= 2 then 'high'
      when (
        (case when oa.transaction_count > 0 and (oa.discounted_count::numeric / oa.transaction_count) > 0.20 then 1 else 0 end) +
        (case when coalesce(oa.void_count, 0) > 3 then 1 else 0 end) +
        (case when abs(coalesce(sa.net_drawer_discrepancy, 0)) > 15.00 then 1 else 0 end)
      ) = 1 then 'medium'
      else 'low'
    end
  from relevant_cashiers rc
  join profiles p on p.id = rc.id
  left join order_agg oa on oa.cashier_id = rc.id
  left join item_agg ia on ia.cashier_id = rc.id
  left join session_agg sa on sa.cashier_id = rc.id
  order by coalesce(oa.total_sales_volume, 0) desc;
end;
$$;

grant execute on function public.get_cashier_performance_metrics(uuid, timestamptz, timestamptz) to authenticated;

-- ============================================================================
-- get_inventory_health_metrics
-- ============================================================================
create or replace function public.get_inventory_health_metrics(p_store_id uuid)
returns jsonb
language plpgsql
stable
as $$
declare
  v_dead_stock jsonb;
  v_sell_through numeric;
  v_fast_movers jsonb;
  v_slow_movers jsonb;
begin
  with last_sale as (
    select oi.product_id, max(o.created_at) as last_sale_at
    from order_items oi
    join orders o on o.id = oi.order_id
    where o.store_id = p_store_id and o.status <> 'voided' and (oi.quantity - oi.refunded_quantity) > 0
    group by oi.product_id
  ),
  aged as (
    select
      p.current_stock,
      p.cost_price,
      case when ls.last_sale_at is null then 9999
           else extract(day from (now() - ls.last_sale_at))::int
      end as days_since_sale
    from products p
    left join last_sale ls on ls.product_id = p.id
    where p.store_id = p_store_id and p.is_active = true and p.current_stock > 0
  ),
  bucketed as (
    select
      case
        when days_since_sale between 30 and 59 then '30-59'
        when days_since_sale between 60 and 89 then '60-89'
        when days_since_sale >= 90 then '90+'
      end as bucket,
      current_stock * cost_price as capital
    from aged
    where days_since_sale >= 30
  )
  select coalesce(jsonb_agg(jsonb_build_object('bucket', bucket, 'sku_count', cnt, 'capital_locked', round(capital_locked, 2)) order by bucket), '[]'::jsonb)
  into v_dead_stock
  from (
    select bucket, count(*) as cnt, coalesce(sum(capital), 0) as capital_locked
    from bucketed
    group by bucket
  ) b;

  with units_30d as (
    select oi.product_id, sum(oi.quantity - oi.refunded_quantity) as units
    from order_items oi
    join orders o on o.id = oi.order_id
    where o.store_id = p_store_id and o.status <> 'voided' and o.created_at >= now() - interval '30 days'
    group by oi.product_id
  ),
  totals as (
    select
      coalesce(sum(u.units), 0) as total_units_30d,
      coalesce(sum(p.current_stock), 0) as total_current_stock
    from products p
    left join units_30d u on u.product_id = p.id
    where p.store_id = p_store_id and p.is_active = true
  )
  select round(coalesce((total_units_30d::numeric / nullif(total_current_stock + total_units_30d, 0)) * 100.0, 0.00), 2)
  into v_sell_through
  from totals;

  with velocity as (
    select p.id, p.name, p.sku, coalesce(sum(oi.quantity - oi.refunded_quantity), 0) as units_30d
    from products p
    left join order_items oi on oi.product_id = p.id
    left join orders o on o.id = oi.order_id and o.status <> 'voided' and o.created_at >= now() - interval '30 days'
    where p.store_id = p_store_id and p.is_active = true
    group by p.id, p.name, p.sku
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'sku', sku, 'units_30d', units_30d)), '[]'::jsonb)
  into v_fast_movers
  from (select * from velocity order by units_30d desc limit 5) v;

  with velocity as (
    select p.id, p.name, p.sku, coalesce(sum(oi.quantity - oi.refunded_quantity), 0) as units_30d
    from products p
    left join order_items oi on oi.product_id = p.id
    left join orders o on o.id = oi.order_id and o.status <> 'voided' and o.created_at >= now() - interval '30 days'
    where p.store_id = p_store_id and p.is_active = true
    group by p.id, p.name, p.sku
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'sku', sku, 'units_30d', units_30d)), '[]'::jsonb)
  into v_slow_movers
  from (select * from velocity order by units_30d asc limit 5) v;

  return jsonb_build_object(
    'dead_stock_aging', v_dead_stock,
    'sell_through_rate_30d', v_sell_through,
    'fast_movers', v_fast_movers,
    'slow_movers', v_slow_movers
  );
end;
$$;

grant execute on function public.get_inventory_health_metrics(uuid) to authenticated;
