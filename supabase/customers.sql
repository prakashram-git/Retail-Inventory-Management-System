-- Customer registration (gap found during a Shopify-parity pass: this
-- system had no customer concept anywhere — no way to attach a shopper to a
-- sale, no repeat-customer lookup, nothing). Store-scoped like everything
-- else in this schema. Deliberately lets cashiers INSERT (registering a
-- customer at the register is a cashier's job, same as ringing up a sale)
-- but restricts UPDATE/DELETE to store_manager/super_admin, mirroring the
-- INSERT-vs-UPDATE/DELETE split role_scoped_write_policies.sql already uses
-- for products/categories/inventory_logs — just with cashier additionally
-- allowed on INSERT here, since registration (unlike product creation) is
-- routine cashier work.
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id),
  full_name text not null,
  phone text,
  email text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_customers_store on public.customers(store_id);
-- Case-insensitive per-store uniqueness when a phone is given (the primary
-- real-world identifier for repeat-customer lookup); NULL/'' repeat freely,
-- same convention products.barcode already uses for the same reason.
create unique index if not exists uq_customers_store_phone_case_insensitive
  on public.customers(store_id, lower(phone))
  where phone is not null and phone <> '';

alter table public.customers enable row level security;

drop policy if exists customers_select on public.customers;
create policy customers_select on public.customers
  for select
  using (get_auth_role() = 'super_admin' or store_id = get_auth_store_id());

drop policy if exists customers_insert on public.customers;
create policy customers_insert on public.customers
  for insert
  with check (
    get_auth_role() in ('super_admin', 'store_manager', 'cashier')
    and (get_auth_role() = 'super_admin' or store_id = get_auth_store_id())
  );

drop policy if exists customers_update on public.customers;
create policy customers_update on public.customers
  for update
  using (get_auth_role() = 'super_admin' or store_id = get_auth_store_id())
  with check (
    get_auth_role() in ('super_admin', 'store_manager')
    and (get_auth_role() = 'super_admin' or store_id = get_auth_store_id())
  );

-- No DELETE policy: a customer with order history can't be hard-deleted
-- anyway (orders.customer_id below is ON DELETE RESTRICT, the same
-- soft-delete-not-hard-delete reasoning CLAUDE.md documents for products —
-- inventory_logs/order_items FKs with no cascade). Deactivation is a plain
-- UPDATE (is_active = false), already covered by customers_update.

-- Optional link from a sale to the customer it was for. Nullable — most
-- checkouts still won't have one. RESTRICT (not SET NULL/CASCADE) because
-- orders has a BEFORE UPDATE/DELETE trigger (prevent_ledger_modification())
-- that unconditionally blocks mutation, including one a FK's SET NULL action
-- would trigger — RESTRICT is the only delete action that doesn't fight it.
alter table public.orders
  add column if not exists customer_id uuid references public.customers(id) on delete restrict;
create index if not exists idx_orders_customer on public.orders(customer_id) where customer_id is not null;

-- process_pos_checkout gains p_customer_id (nullable, appended at the end so
-- every existing positional/named call site that omits it keeps working).
create or replace function public.process_pos_checkout(
  p_idempotency_key text, p_store_id uuid, p_session_id uuid, p_cashier_id uuid,
  p_items jsonb, p_payment_method payment_method, p_discount numeric, p_amount_tendered numeric,
  p_auth_code text default null, p_card_brand text default null, p_card_last_four text default null,
  p_is_offline boolean default false, p_offline_timestamp timestamptz default null, p_offline_invoice text default null,
  p_customer_id uuid default null
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
    payment_auth_code, card_brand, card_last_four, is_offline_sync, offline_created_at, status,
    customer_id
  ) VALUES (
    p_store_id, p_session_id, p_cashier_id, p_idempotency_key, v_invoice_number, 'PENDING_HASH',
    v_currency, v_subtotal, v_tax, COALESCE(p_discount, 0.00), v_total, p_payment_method,
    p_amount_tendered, GREATEST(0.00, p_amount_tendered - v_total),
    p_auth_code, p_card_brand, p_card_last_four, p_is_offline, p_offline_timestamp, v_status,
    p_customer_id
  ) RETURNING id INTO v_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    SELECT * INTO v_product FROM products WHERE id = (v_item->>'product_id')::uuid;

    UPDATE products
    SET current_stock = current_stock - (v_item->>'quantity')::int, updated_at = now()
    WHERE id = v_product.id;

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
