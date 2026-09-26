-- Append-only audit trail for terminal lock/unlock and parked-cart ownership
-- transitions (PRD sections 2/3: state machine + multi-server preemption).
-- Written client-side from the POS terminal itself (SessionProvider,
-- OrphanedCartPrompt, LockOverlay) as a best-effort log, not a security
-- boundary — mirrors how cash_drawer_sessions already accepts
-- cashier-originated INSERTs. Reads are restricted to management roles.
create table if not exists public.terminal_lock_events (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  unit_number text,
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null check (event_type in (
    'locked', 'unlocked', 'cart_parked', 'cart_claimed', 'cart_discarded',
    'unlock_failed', 'unlock_locked_out'
  )),
  reason text,
  related_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_terminal_lock_events_store_created
  on public.terminal_lock_events (store_id, created_at desc);

alter table public.terminal_lock_events enable row level security;

drop policy if exists terminal_lock_events_insert on public.terminal_lock_events;
create policy terminal_lock_events_insert
  on public.terminal_lock_events
  for insert
  with check (
    get_auth_role() = 'super_admin' or store_id = get_auth_store_id()
  );

drop policy if exists terminal_lock_events_select on public.terminal_lock_events;
create policy terminal_lock_events_select
  on public.terminal_lock_events
  for select
  using (
    get_auth_role() = 'super_admin'
    or (get_auth_role() = 'store_manager' and store_id = get_auth_store_id())
  );

-- This is an audit ledger — no UPDATE/DELETE policy is defined, so those
-- commands are denied by RLS default-deny once RLS is enabled, same intent as
-- prevent_ledger_modification() on orders/order_items/inventory_logs (a
-- lighter-weight version: no trigger needed since there's no legitimate
-- restore/backfill path that would need a bypass here).
