-- Applied to the live database. Fixes a confirmed privilege-escalation gap
-- found during a "Product Creation & Ingestion" QA pass: the existing
-- `tenant_isolation_{products,categories,inventory_logs}` policies were each
-- a single `FOR ALL` policy checking only tenant isolation
-- (get_auth_role() = 'super_admin' OR store_id = get_auth_store_id()), with
-- no role check at all. Verified live: an authenticated cashier session
-- could INSERT directly into `products` and it succeeded — cashiers were
-- never restricted to read-only access at the database layer, only hidden
-- from the "+ Add Product" button in the UI, which is not a security
-- boundary (Next.js server actions and the Supabase publishable key are
-- both reachable directly from the browser regardless of what the UI shows).
--
-- This splits each `FOR ALL` policy into a SELECT policy (unchanged tenant
-- isolation, open to any role so cashiers can still read the POS catalog)
-- and separate INSERT/UPDATE/DELETE policies additionally requiring
-- get_auth_role() IN ('super_admin', 'store_manager').
--
-- inventory_logs is included because process_pos_checkout and
-- process_order_refund both INSERT into it and UPDATE products on a
-- cashier's behalf — but both are `SECURITY DEFINER` functions owned by a
-- role that bypasses RLS (the Supabase convention for SQL-editor-created
-- functions), so this restriction does not affect them. Verified live after
-- applying: a real cashier session still completes a checkout successfully
-- through process_pos_checkout.

drop policy if exists tenant_isolation_products on products;
create policy tenant_isolation_products_select on products
  for select
  using (get_auth_role() = 'super_admin' or store_id = get_auth_store_id());
create policy tenant_isolation_products_insert on products
  for insert
  with check (
    get_auth_role() in ('super_admin', 'store_manager')
    and (get_auth_role() = 'super_admin' or store_id = get_auth_store_id())
  );
create policy tenant_isolation_products_update on products
  for update
  using (get_auth_role() = 'super_admin' or store_id = get_auth_store_id())
  with check (
    get_auth_role() in ('super_admin', 'store_manager')
    and (get_auth_role() = 'super_admin' or store_id = get_auth_store_id())
  );
create policy tenant_isolation_products_delete on products
  for delete
  using (
    get_auth_role() in ('super_admin', 'store_manager')
    and (get_auth_role() = 'super_admin' or store_id = get_auth_store_id())
  );

drop policy if exists tenant_isolation_categories on categories;
create policy tenant_isolation_categories_select on categories
  for select
  using (get_auth_role() = 'super_admin' or store_id = get_auth_store_id());
create policy tenant_isolation_categories_insert on categories
  for insert
  with check (
    get_auth_role() in ('super_admin', 'store_manager')
    and (get_auth_role() = 'super_admin' or store_id = get_auth_store_id())
  );
create policy tenant_isolation_categories_update on categories
  for update
  using (get_auth_role() = 'super_admin' or store_id = get_auth_store_id())
  with check (
    get_auth_role() in ('super_admin', 'store_manager')
    and (get_auth_role() = 'super_admin' or store_id = get_auth_store_id())
  );
create policy tenant_isolation_categories_delete on categories
  for delete
  using (
    get_auth_role() in ('super_admin', 'store_manager')
    and (get_auth_role() = 'super_admin' or store_id = get_auth_store_id())
  );

drop policy if exists tenant_isolation_inventory_logs on inventory_logs;
create policy tenant_isolation_inventory_logs_select on inventory_logs
  for select
  using (get_auth_role() = 'super_admin' or store_id = get_auth_store_id());
create policy tenant_isolation_inventory_logs_insert on inventory_logs
  for insert
  with check (
    get_auth_role() in ('super_admin', 'store_manager')
    and (get_auth_role() = 'super_admin' or store_id = get_auth_store_id())
  );
create policy tenant_isolation_inventory_logs_update on inventory_logs
  for update
  using (get_auth_role() = 'super_admin' or store_id = get_auth_store_id())
  with check (
    get_auth_role() in ('super_admin', 'store_manager')
    and (get_auth_role() = 'super_admin' or store_id = get_auth_store_id())
  );
create policy tenant_isolation_inventory_logs_delete on inventory_logs
  for delete
  using (
    get_auth_role() in ('super_admin', 'store_manager')
    and (get_auth_role() = 'super_admin' or store_id = get_auth_store_id())
  );
