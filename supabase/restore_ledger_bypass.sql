-- Backup/restore engine (lib/backup/backupEngine.ts, app/dashboard/settings/backup).
--
-- Dimension tables (stores, profiles, categories, products, system_settings,
-- cash_drawer_sessions) are restored directly by the app via the service-role
-- client's ordinary .upsert() — they carry no immutability trigger.
--
-- orders/order_items/inventory_logs do (prevent_ledger_modification.sql,
-- BEFORE UPDATE/DELETE only). Re-inserting a row that was deleted and no
-- longer conflicts needs no bypass at all — it's a plain INSERT. This RPC is
-- only reached when a restore's row *already exists* and must be overwritten
-- (e.g. repairing a corrupted row from a known-good archive), which is an
-- UPDATE and would otherwise be blocked. Restricted to super_admin, restricted
-- to a fixed table whitelist checked before that name is ever interpolated
-- into dynamic SQL (so this can't be used to reach an arbitrary table), and
-- scoped to the same transaction-local app.bypass_ledger_guard GUC used by
-- process_pos_checkout/process_order_refund.
create or replace function public.restore_upsert_ledger(p_table text, p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_role text := get_auth_role();
  v_cols text;
  v_excluded_cols text;
  v_sql text;
  v_count int;
begin
  if v_caller_role <> 'super_admin' then
    raise exception 'Only super admins can restore backups';
  end if;

  if p_table not in ('orders', 'order_items', 'inventory_logs') then
    raise exception 'Table % is not a restorable ledger table', p_table;
  end if;

  perform set_config('app.bypass_ledger_guard', 'on', true);

  select
    string_agg(quote_ident(column_name), ', ' order by ordinal_position),
    string_agg('excluded.' || quote_ident(column_name), ', ' order by ordinal_position)
  into v_cols, v_excluded_cols
  from information_schema.columns
  where table_schema = 'public' and table_name = p_table;

  if v_cols is null then
    raise exception 'Table % has no columns (does it exist?)', p_table;
  end if;

  v_sql := format(
    'insert into %1$I select * from jsonb_populate_recordset(null::%1$I, $1) ' ||
    'on conflict (id) do update set (%2$s) = (%3$s)',
    p_table, v_cols, v_excluded_cols
  );

  execute v_sql using p_rows;
  get diagnostics v_count = row_count;

  return jsonb_build_object('table', p_table, 'rows_written', v_count);
end;
$$;

grant execute on function public.restore_upsert_ledger(text, jsonb) to authenticated;
