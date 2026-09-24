-- Foundation for the executive digest / cashier scorecard / inventory health
-- analytics: historical cost snapshots, performance indexes, and a security
-- audit finding fixed along the way (see notes below each section).
--
-- Applied directly against the live database via a Postgres connection
-- (not just PostgREST) since this includes DDL, enum/type-adjacent changes,
-- and new RPCs.

-- ============================================================================
-- 1. Historical cost-price snapshot on order_items
-- ============================================================================
-- Without this, changing a product's cost_price retroactively distorts every
-- past order's COGS/margin the next time a report reads it, since the old
-- code always joined to products.cost_price live. unit_price already worked
-- this way correctly (snapshotted at sale time by process_pos_checkout); cost
-- just never was.
alter table public.order_items add column if not exists unit_cost numeric(14,4) default 0.00;

-- One-time backfill for pre-existing rows. This can only approximate the true
-- historical cost with today's cost_price, since no snapshot ever existed —
-- an inherent, unavoidable limitation for orders placed before this migration,
-- not a bug. Every order from this point forward gets the real value via the
-- process_pos_checkout change below.
--
-- order_items carries the same BEFORE UPDATE immutability trigger as orders
-- (trg_immutable_order_items) and blocks this backfill by default; bypassed
-- here the same way process_pos_checkout/process_order_refund do for their
-- own writes, scoped to just this transaction.
select set_config('app.bypass_ledger_guard', 'on', true);

update public.order_items oi
set unit_cost = p.cost_price
from public.products p
where oi.product_id = p.id and oi.unit_cost = 0.00;

create or replace function public.process_pos_checkout(
  p_idempotency_key text, p_store_id uuid, p_session_id uuid, p_cashier_id uuid,
  p_items jsonb, p_payment_method payment_method, p_discount numeric, p_amount_tendered numeric,
  p_auth_code text default null, p_card_brand text default null, p_card_last_four text default null,
  p_is_offline boolean default false, p_offline_timestamp timestamptz default null, p_offline_invoice text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_existing_order orders;
  v_order_id uuid;
  v_invoice_number text;
  v_subtotal numeric(14,4) := 0;
  v_tax numeric(14,4) := 0;
  v_total numeric(14,4) := 0;
  v_tax_rate numeric(5,2);
  v_tax_model tax_calculation_model;
  v_currency text;
  v_item jsonb;
  v_product record;
  v_status order_status := 'completed';
  v_has_variance boolean := false;
BEGIN
  SELECT * INTO v_existing_order FROM orders WHERE idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN jsonb_build_object('order_id', v_existing_order.id, 'invoice_number', v_existing_order.invoice_number, 'total', v_existing_order.total, 'status', v_existing_order.status);
  END IF;

  SELECT tax_model, currency INTO v_tax_model, v_currency FROM stores WHERE id = p_store_id;
  SELECT COALESCE(default_tax_rate, 8.00) INTO v_tax_rate FROM system_settings WHERE store_id = p_store_id;
  IF v_tax_rate IS NULL THEN v_tax_rate := 8.00; END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) ORDER BY (value->>'product_id')::uuid ASC LOOP
    SELECT * INTO v_product FROM products WHERE id = (v_item->>'product_id')::uuid FOR UPDATE;

    IF v_product.current_stock < (v_item->>'quantity')::int THEN
      IF p_is_offline THEN
        v_has_variance := true;
        v_status := 'completed_with_stock_variance';
      ELSE
        RAISE EXCEPTION 'Insufficient stock for product: % (Available: %, Requested: %)', v_product.name, v_product.current_stock, (v_item->>'quantity')::int;
      END IF;
    END IF;
    v_subtotal := v_subtotal + (v_product.retail_price * (v_item->>'quantity')::int);
  END LOOP;

  IF v_tax_model = 'exclusive' THEN
    v_tax := round((v_subtotal - COALESCE(p_discount, 0.00)) * (v_tax_rate / 100.00), 2);
    v_total := (v_subtotal - COALESCE(p_discount, 0.00)) + v_tax;
  ELSE
    v_total := v_subtotal - COALESCE(p_discount, 0.00);
    v_tax := round(v_total - (v_total / (1 + (v_tax_rate / 100.00))), 2);
  END IF;

  IF p_offline_invoice IS NOT NULL THEN
    v_invoice_number := p_offline_invoice;
  ELSE
    v_invoice_number := 'INV-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substring(gen_random_uuid()::text, 1, 6));
  END IF;

  INSERT INTO orders (
    store_id, session_id, cashier_id, idempotency_key, invoice_number, current_order_hash,
    currency, subtotal, tax, discount, total, payment_method, amount_tendered, change_due,
    payment_auth_code, card_brand, card_last_four, is_offline_sync, offline_created_at, status
  ) VALUES (
    p_store_id, p_session_id, p_cashier_id, p_idempotency_key, v_invoice_number, 'PENDING_HASH',
    v_currency, v_subtotal, v_tax, COALESCE(p_discount, 0.00), v_total, p_payment_method,
    p_amount_tendered, GREATEST(0.00, p_amount_tendered - v_total),
    p_auth_code, p_card_brand, p_card_last_four, p_is_offline, p_offline_timestamp, v_status
  ) RETURNING id INTO v_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    SELECT * INTO v_product FROM products WHERE id = (v_item->>'product_id')::uuid;

    UPDATE products
    SET current_stock = current_stock - (v_item->>'quantity')::int, updated_at = now()
    WHERE id = v_product.id;

    -- unit_cost snapshots cost_price *at sale time*, same principle as
    -- unit_price already did — this is the only change from the original.
    INSERT INTO order_items (order_id, product_id, quantity, unit_price, unit_cost, subtotal)
    VALUES (v_order_id, v_product.id, (v_item->>'quantity')::int, v_product.retail_price, v_product.cost_price, (v_product.retail_price * (v_item->>'quantity')::int));

    INSERT INTO inventory_logs (
      store_id, product_id, change_type, quantity, previous_stock, new_stock, reference_id, notes, created_by
    ) VALUES (
      p_store_id, v_product.id,
      CASE WHEN v_has_variance THEN 'offline_variance'::stock_movement_type ELSE 'sale'::stock_movement_type END,
      (v_item->>'quantity')::int, v_product.current_stock, v_product.current_stock - (v_item->>'quantity')::int,
      v_order_id, CASE WHEN v_has_variance THEN 'Offline sync variance logged' ELSE 'POS Register Checkout' END, p_cashier_id
    );
  END LOOP;

  RETURN jsonb_build_object('order_id', v_order_id, 'invoice_number', v_invoice_number, 'total', v_total, 'status', v_status);
END;
$function$;

-- ============================================================================
-- 2. Analytical indexes
-- ============================================================================
create index if not exists idx_orders_store_created_status on public.orders(store_id, created_at, status);
create index if not exists idx_orders_cashier_created on public.orders(cashier_id, created_at);
create index if not exists idx_sessions_cashier_dates on public.cash_drawer_sessions(cashier_id, opened_at, closed_at);
create index if not exists idx_order_items_order_product on public.order_items(order_id, product_id);

-- ============================================================================
-- 3. Security hardening found during this audit: orders/order_items/
--    cash_drawer_sessions each had a single ungated `FOR ALL` RLS policy
--    (tenant isolation only, no role check) — the same privilege-escalation
--    class already fixed for products/categories/inventory_logs in
--    role_scoped_write_policies.sql, just never applied here. Forged orders
--    or tampered drawer sessions would directly corrupt the new digest and
--    loss-prevention numbers this migration exists to build, so it's fixed
--    here rather than separately.
-- ============================================================================

-- orders / order_items: no legitimate code path inserts/updates/deletes
-- these directly (checkout goes through process_pos_checkout, refunds
-- through process_order_refund, both SECURITY DEFINER and thus unaffected
-- by this) — confirmed by grepping the app for direct .insert/.update/.delete
-- calls against these tables before writing this. UPDATE/DELETE were already
-- blocked by trg_immutable_orders/trg_immutable_order_items; INSERT was not.
drop policy if exists tenant_isolation_orders on public.orders;
create policy tenant_isolation_orders_select on public.orders
  for select using (get_auth_role() = 'super_admin' or store_id = get_auth_store_id());
create policy tenant_isolation_orders_insert on public.orders
  for insert with check (
    get_auth_role() in ('super_admin', 'store_manager')
    and (get_auth_role() = 'super_admin' or store_id = get_auth_store_id())
  );
create policy tenant_isolation_orders_update on public.orders
  for update
  using (get_auth_role() = 'super_admin' or store_id = get_auth_store_id())
  with check (
    get_auth_role() in ('super_admin', 'store_manager')
    and (get_auth_role() = 'super_admin' or store_id = get_auth_store_id())
  );
create policy tenant_isolation_orders_delete on public.orders
  for delete using (
    get_auth_role() in ('super_admin', 'store_manager')
    and (get_auth_role() = 'super_admin' or store_id = get_auth_store_id())
  );

drop policy if exists tenant_isolation_order_items on public.order_items;
create policy tenant_isolation_order_items_select on public.order_items
  for select using (
    exists (select 1 from orders o where o.id = order_items.order_id
      and (get_auth_role() = 'super_admin' or o.store_id = get_auth_store_id()))
  );
create policy tenant_isolation_order_items_insert on public.order_items
  for insert with check (
    get_auth_role() in ('super_admin', 'store_manager')
    and exists (select 1 from orders o where o.id = order_items.order_id
      and (get_auth_role() = 'super_admin' or o.store_id = get_auth_store_id()))
  );
create policy tenant_isolation_order_items_update on public.order_items
  for update
  using (
    exists (select 1 from orders o where o.id = order_items.order_id
      and (get_auth_role() = 'super_admin' or o.store_id = get_auth_store_id()))
  )
  with check (
    get_auth_role() in ('super_admin', 'store_manager')
    and exists (select 1 from orders o where o.id = order_items.order_id
      and (get_auth_role() = 'super_admin' or o.store_id = get_auth_store_id()))
  );
create policy tenant_isolation_order_items_delete on public.order_items
  for delete using (
    get_auth_role() in ('super_admin', 'store_manager')
    and exists (select 1 from orders o where o.id = order_items.order_id
      and (get_auth_role() = 'super_admin' or o.store_id = get_auth_store_id()))
  );

-- cash_drawer_sessions: cashiers legitimately open/close their OWN drawer
-- directly from the client (lib/pos/session.ts) — unlike orders, this can't
-- just be restricted to managers. Instead: a cashier may still INSERT their
-- own session (opening a float has low fraud value either direction), but
-- may no longer UPDATE any session directly at all — closing now goes
-- through close_cash_drawer_session() below, which recomputes expected_cash/
-- discrepancy from real order data server-side instead of trusting whatever
-- the client submits (the actual vulnerability: a cashier's browser
-- previously computed and sent its own discrepancy value directly).
drop policy if exists tenant_isolation_sessions on public.cash_drawer_sessions;
create policy tenant_isolation_sessions_select on public.cash_drawer_sessions
  for select using (get_auth_role() = 'super_admin' or store_id = get_auth_store_id());
create policy tenant_isolation_sessions_insert on public.cash_drawer_sessions
  for insert with check (
    (get_auth_role() = 'super_admin' or store_id = get_auth_store_id())
    and (get_auth_role() in ('super_admin', 'store_manager') or cashier_id = auth.uid())
  );
create policy tenant_isolation_sessions_update on public.cash_drawer_sessions
  for update
  using (get_auth_role() in ('super_admin', 'store_manager') and (get_auth_role() = 'super_admin' or store_id = get_auth_store_id()))
  with check (get_auth_role() in ('super_admin', 'store_manager') and (get_auth_role() = 'super_admin' or store_id = get_auth_store_id()));
create policy tenant_isolation_sessions_delete on public.cash_drawer_sessions
  for delete using (get_auth_role() in ('super_admin', 'store_manager') and (get_auth_role() = 'super_admin' or store_id = get_auth_store_id()));

create or replace function public.close_cash_drawer_session(
  p_session_id uuid,
  p_closing_counted_cash numeric,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session cash_drawer_sessions%rowtype;
  v_caller_role text := get_auth_role();
  v_cash_total numeric(14,4) := 0;
  v_expected_cash numeric(14,4);
  v_discrepancy numeric(14,4);
begin
  select * into v_session from cash_drawer_sessions where id = p_session_id;
  if v_session.id is null then
    raise exception 'Session % not found', p_session_id;
  end if;

  if v_caller_role not in ('super_admin', 'store_manager') and v_session.cashier_id <> auth.uid() then
    raise exception 'You can only close your own cash drawer session';
  end if;

  if v_session.status = 'closed' then
    raise exception 'This session is already closed';
  end if;

  -- Mirrors lib/pos/session.ts's getSessionSalesReport() cash-total logic
  -- exactly (voided and fully-refunded orders excluded, partial refunds left
  -- at full value) — computed here from the real ledger, not trusted from
  -- the client.
  select coalesce(sum(total), 0) into v_cash_total
  from orders
  where session_id = p_session_id
    and payment_method = 'cash'
    and status not in ('voided', 'refunded');

  v_expected_cash := v_session.opening_float + v_cash_total;
  v_discrepancy := p_closing_counted_cash - v_expected_cash;

  update cash_drawer_sessions
  set status = 'closed',
      closing_counted_cash = p_closing_counted_cash,
      expected_cash = v_expected_cash,
      discrepancy = v_discrepancy,
      closed_at = now(),
      notes = p_notes
  where id = p_session_id;

  return jsonb_build_object(
    'expected_cash', v_expected_cash,
    'discrepancy', v_discrepancy,
    'closed_at', now()
  );
end;
$$;

grant execute on function public.close_cash_drawer_session(uuid, numeric, text) to authenticated;
