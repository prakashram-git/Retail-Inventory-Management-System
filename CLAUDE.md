# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## What this is

A multi-tenant mall retail POS + inventory system: Next.js 16 (App Router, Turbopack) + React 19 + TypeScript + Tailwind v4, backed by Supabase (Postgres, Auth, Storage). Stores share one database, scoped by `store_id`; roles are `super_admin` (mall-wide), `store_manager`, and `cashier` (POS-only).

## Commands

- `npm run dev` — start the dev server (Turbopack)
- `npm run build` — production build (also runs the TypeScript check)
- `npm run lint` — ESLint (flat config, includes the React Compiler plugin)
- `npx tsc --noEmit` — typecheck only, no build script wraps this
- There is no test suite/framework in this repo (no `test` script, no test files). Don't assume one exists.

Standard verification loop before considering a change done: `npx tsc --noEmit` → `npx eslint .` → `npx next build`.

## Architecture

### Next.js 16 is not the Next.js in your training data
Read `node_modules/next/dist/docs/` before touching routing/middleware/caching APIs. Two concrete breaks already hit in this repo: the middleware file is `proxy.ts` (function must be named `proxy`, not `middleware`), and `cookies()`/`headers()` are fully async with no sync fallback.

### Store resolution — the recurring bug class
A `super_admin` has `profiles.store_id = null`; their active store comes from the `mall_active_store_id` cookie (`lib/constants.ts`) instead. Every place that resolves "which store is this request for" must fall back to the mall's alphabetically-first store when that cookie is absent, via `resolveActiveStoreId()` (`lib/store/resolve-active-store.ts`) — never fall back to `profile.store_id` directly for a super_admin, it's always null and silently produces `storeId = null`. This has caused real bugs twice: a `NOT NULL` constraint crash on `cash_drawer_sessions.store_id`, and silently-empty dashboard pages. Server Components call it directly; Server Actions get it through `requireStoreContext()` (`lib/actions/shared.ts`), which all mutation actions must call rather than resolving storeId themselves.

### Auth & authorization layers
- `lib/supabase/client.ts` (browser), `lib/supabase/server.ts` (Server Components/Actions, async cookie-based), `lib/supabase/admin.ts` (service-role, `server-only`, used only for admin-privileged operations like creating Auth users).
- `proxy.ts` refreshes the session and enforces route-level RBAC (cashier → `/pos`, unauthenticated → `/login`).
- `requireStoreContext()` / `requireSuperAdmin()` (`lib/actions/shared.ts`) are the Server Action-side authorization helpers. `requireStoreContext()` rejects `role === "cashier"` outright.
- **The database is the real security boundary, not the app.** RLS policies on `products`/`categories`/`inventory_logs` (`supabase/role_scoped_write_policies.sql`) separately restrict SELECT (any role, tenant-scoped) from INSERT/UPDATE/DELETE (`super_admin`/`store_manager` only), using the Postgres functions `get_auth_role()`/`get_auth_store_id()`. This matters because the Supabase publishable key is exposed to every browser — a Next.js-layer check alone can always be bypassed by calling Supabase directly. Any new mutable table needs the same read/write policy split, not a single `FOR ALL` policy.

### Ledger immutability
`orders`, `order_items`, and `inventory_logs` each have a `BEFORE UPDATE/DELETE` trigger (`prevent_ledger_modification()`, `supabase/prevent_ledger_modification.sql`) that unconditionally blocks mutation/deletion — including from the service-role key. The only sanctioned way around it is a transaction-local bypass a trusted `SECURITY DEFINER` RPC sets for itself: `PERFORM set_config('app.bypass_ledger_guard', 'on', true)` before its own writes (see `process_pos_checkout`, `process_order_refund`). Never disable or drop this trigger to make a mutation work — add the bypass inside a purpose-built RPC instead, scoped to that one transaction.

Consequence for products: `deleteProduct` is a soft delete (`is_active = false`), not a hard `DELETE` — `inventory_logs.product_id`/`order_items.product_id` are FKs with no cascade, so hard-deleting a product with any history fails. The inventory management table intentionally still lists inactive products (badged "Inactive"); only the POS catalog filters `is_active = true`.

### SQL objects live in the database, not in a migration pipeline
RPCs, RLS policies, and trigger functions are tracked as `.sql` files under `supabase/` but nothing applies them automatically — no `npm` script, no CI step. They must be run manually against the target database (Supabase SQL editor, or `psql`/`pg` with a direct connection string; PostgREST/the JS client cannot run DDL). Before assuming a referenced RPC works, verify it's actually applied — this repo has shipped with `.sql` files present but never run more than once.

### Server Action + shared Zod schema pattern
`"use server"` files can only export async functions, so a schema used by both a Server Action and a client-side `react-hook-form` resolver has to live in its own plain module (e.g. `lib/products/schema.ts`, imported by both `lib/actions/products.ts` and `components/dashboard/inventory/ProductSheet.tsx`). Follow this split for any new form.

### Offline-first POS
`lib/offline/db.ts` defines the Dexie (IndexedDB) schema `MallRetailOfflineDB` (`cached_products`, `offline_orders_queue`, `offline_categories`). `SyncProvider` (`components/providers/SyncProvider.tsx`) tracks connectivity and auto-replays the queue on reconnect via `lib/offline/sync.ts`, calling the `process_pos_checkout` RPC with `p_is_offline: true`. A replayed sale against stock that's since changed lands as `status = 'completed_with_stock_variance'` with an `inventory_logs` row of `change_type = 'offline_variance'` — this is expected, reconcilable behavior, not a bug (and is why `current_stock` is allowed to go negative — don't add a `CHECK (current_stock >= 0)` constraint).

### GS1 barcode validation
`lib/utils/barcode.ts` `validateGS1Barcode()` implements the GTIN-8/12/13 mod-10 check digit. It's gated by a shape check (`/^\d{8}$|^\d{12}$|^\d{13}$/`) so plain alphanumeric SKUs skip validation. Wired into both the POS scan handler (`components/pos/PosTerminal.tsx`) and the product form schema (`lib/products/schema.ts`) — keep both in sync if the algorithm changes.

### Thermal receipt printing
`app/globals.css` has `@media print` rules that hide everything except `#receipt-print-area` (80mm width, JetBrains Mono). Any new printable receipt/report (Z-report, return credit slip, etc.) must render inside a container with that exact id.

### Multi-currency
`lib/utils/currency.ts` handles zero-decimal (JPY/KRW/VND) and three-decimal (BHD/KWD/OMR) currencies correctly via `getCurrencyDecimals()`, not just USD-style 2-decimal — use `formatCurrency`/`getQuickTenderDenominations` rather than hand-rolling `Intl.NumberFormat` calls.

### UI primitives
`components/ui/*` are shadcn-style wrappers built on `@base-ui/react` (imports like `@base-ui/react/checkbox`), not Radix. When a needed primitive doesn't exist yet, scaffold it following an existing one (e.g. `components/ui/switch.tsx`) rather than introducing a different headless-UI library.
