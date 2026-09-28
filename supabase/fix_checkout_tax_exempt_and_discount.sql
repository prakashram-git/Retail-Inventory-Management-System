-- Bug found while wiring up the POS discount control (the RPC always
-- accepted p_discount, but no UI ever sent a nonzero one, so this was never
-- exercised): process_pos_checkout taxed the *entire* subtotal regardless of
-- categories.is_tax_exempt, unlike the client's own calculateCartTotals
-- (lib/pos/pricing.ts), which already excludes tax-exempt lines from the
-- taxable amount. A cart mixing exempt and non-exempt items in an
-- 'exclusive'-tax store was silently overtaxed server-side (the receipt the
-- cashier saw, built from client totals, understated what actually got
-- charged and recorded in the ledger) — a real client/server total mismatch
-- that existed before this migration, just impossible to notice with
-- discount always 0. The discount UI landing at the same time as this fix
-- also exposed a second mismatch: the RPC applied discount *before* tax
-- ((subtotal - discount) * rate), while the client applies it *after* tax
-- (tax on the full taxable amount, discount subtracted from subtotal+tax) —
-- the same order the receipt breakdown (Subtotal / Tax / Discount / Total)
-- already implies. This migration makes the RPC match the client on both.
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
  v_taxable_subtotal numeric(14,4) := 0;
  v_tax numeric(14,4) := 0;
  v_total numeric(14,4) := 0;
  v_tax_rate numeric(5,2);
  v_tax_model tax_calculation_model;
  v_currency text;
  v_item jsonb;
  v_product record;
  v_is_exempt boolean;
  v_line_total numeric(14,4);
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

    SELECT COALESCE(c.is_tax_exempt, false) INTO v_is_exempt
    FROM categories c WHERE c.id = v_product.category_id;

    v_line_total := v_product.retail_price * (v_item->>'quantity')::int;
    v_subtotal := v_subtotal + v_line_total;
    IF NOT COALESCE(v_is_exempt, false) THEN
      v_taxable_subtotal := v_taxable_subtotal + v_line_total;
    END IF;
  END LOOP;

  -- Mirrors lib/pos/pricing.ts calculateCartTotals exactly: tax is computed
  -- only on the taxable portion, and discount is applied after tax (not
  -- baked into the taxed amount) — same order the receipt already displays
  -- (Subtotal, Tax, Discount, Total).
  IF v_tax_model = 'exclusive' THEN
    v_tax := round(v_taxable_subtotal * (v_tax_rate / 100.00), 2);
    v_total := GREATEST(0.00, v_subtotal + v_tax - COALESCE(p_discount, 0.00));
  ELSE
    v_tax := round(v_taxable_subtotal - (v_taxable_subtotal / (1 + (v_tax_rate / 100.00))), 2);
    v_total := GREATEST(0.00, v_subtotal - COALESCE(p_discount, 0.00));
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
