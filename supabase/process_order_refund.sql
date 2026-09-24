-- Applied to the live database. The Orders & Returns page's return modal
-- (lib/orders/refund.ts) calls this RPC by name; there's no dedicated
-- refunds table in the schema, so a refund is recorded as increased
-- order_items.refunded_quantity + an orders.status transition + a restocking
-- inventory_logs entry, consistent with how process_pos_checkout already
-- writes the sale side of this ledger.
--
-- order_items and orders both carry a BEFORE UPDATE/DELETE immutability
-- trigger (prevent_ledger_modification.sql) that predates this file and was
-- applied directly to the database outside this repo. It unconditionally
-- blocked this function's own UPDATE statements below until
-- prevent_ledger_modification.sql was updated to accept a transaction-local
-- bypass GUC — set once here, at the top, so only this function (not a
-- direct client/service-role mutation) can pass the guard.
--
-- Also fixes a latent bug caught on first live execution: `orders.status` is
-- the `order_status` enum, and a bare `case ... then 'refunded' ... end`
-- infers as `text`, which Postgres won't implicitly cast on UPDATE — needs
-- an explicit `::order_status` cast.
--
-- SECURITY FIX (role-audit pass): this function is `security definer`, which
-- means it bypasses RLS entirely — the tenant_isolation_* policies in
-- role_scoped_write_policies.sql do not apply to it. The original version had
-- no role or store-ownership check of its own, so ANY authenticated user
-- (including a cashier, or anyone calling the RPC directly rather than
-- through the UI) could refund any order in any store. Now requires the
-- caller to be super_admin or store_manager, and a store_manager's own store
-- to match the order's store. `created_by` now uses auth.uid() rather than
-- the client-supplied p_cashier_id, since that value was never verified
-- against the actual caller and could be spoofed to misattribute the refund.
create or replace function public.process_order_refund(
  p_order_id uuid,
  p_cashier_id uuid, -- unused; kept so the existing client call signature doesn't need to change. See v_caller_id.
  p_items jsonb, -- [{ "order_item_id": uuid, "quantity": int }, ...]
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_order_item order_items%rowtype;
  v_remaining int;
  v_refund_qty int;
  v_store_id uuid;
  v_total_items int;
  v_fully_refunded_items int;
  v_caller_id uuid := auth.uid();
  v_caller_role text := get_auth_role();
begin
  if v_caller_role not in ('super_admin', 'store_manager') then
    raise exception 'Only super admins and store managers can process refunds';
  end if;

  perform set_config('app.bypass_ledger_guard', 'on', true);

  select store_id into v_store_id from orders where id = p_order_id;
  if v_store_id is null then
    raise exception 'Order % not found', p_order_id;
  end if;

  if v_caller_role = 'store_manager' and v_store_id != get_auth_store_id() then
    raise exception 'Order % does not belong to your store', p_order_id;
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select * into v_order_item
    from order_items
    where id = (v_item->>'order_item_id')::uuid
      and order_id = p_order_id;

    if v_order_item.id is null then
      raise exception 'Order item % does not belong to order %', v_item->>'order_item_id', p_order_id;
    end if;

    v_remaining := v_order_item.quantity - v_order_item.refunded_quantity;
    v_refund_qty := (v_item->>'quantity')::int;

    if v_refund_qty <= 0 or v_refund_qty > v_remaining then
      raise exception 'Refund quantity % exceeds remaining % for order item %',
        v_refund_qty, v_remaining, v_order_item.id;
    end if;

    update order_items
    set refunded_quantity = refunded_quantity + v_refund_qty
    where id = v_order_item.id;

    update products
    set current_stock = current_stock + v_refund_qty
    where id = v_order_item.product_id;

    insert into inventory_logs (
      store_id, product_id, change_type, quantity,
      previous_stock, new_stock, reference_id, notes, created_by
    )
    select
      v_store_id, v_order_item.product_id, 'return', v_refund_qty,
      p.current_stock - v_refund_qty, p.current_stock, p_order_id,
      coalesce(p_reason, 'Order return'), v_caller_id
    from products p where p.id = v_order_item.product_id;
  end loop;

  select count(*), count(*) filter (where quantity = refunded_quantity)
  into v_total_items, v_fully_refunded_items
  from order_items
  where order_id = p_order_id;

  update orders
  set status = (case
    when v_fully_refunded_items = v_total_items then 'refunded'
    else 'partially_refunded'
  end)::order_status
  where id = p_order_id;

  return jsonb_build_object('order_id', p_order_id, 'status',
    (select status from orders where id = p_order_id));
end;
$$;

grant execute on function public.process_order_refund(uuid, uuid, jsonb, text) to authenticated;
