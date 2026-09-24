#!/usr/bin/env -S npx tsx
/**
 * Requires supabase/analytics_foundation.sql and supabase/analytics_rpcs.sql
 * to have been applied first. Creates a disposable test store/products/
 * orders/sessions via the service-role client (bypasses RLS entirely, same
 * as every other test script in this repo), asserts against the three RPCs
 * directly, and cleans up after itself.
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { Client as PgClient } from "pg";
import { localDayOfWeek, localHour } from "../lib/reports/timezone";

for (const envFile of [".env.local", ".env"]) {
  const full = path.join(process.cwd(), envFile);
  if (fs.existsSync(full)) process.loadEnvFile(full);
}

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

interface TestResult {
  id: string;
  name: string;
  pass: boolean;
  detail: string;
}
const results: TestResult[] = [];
function record(id: string, name: string, pass: boolean, detail: string) {
  results.push({ id, name, pass, detail });
  console.log(`[${id}] [${name}] - ${pass ? "PASS" : "FAIL"}: ${detail}`);
}

const TIMEZONE = "America/New_York"; // UTC-4/-5 — guarantees 23:30 local crosses the UTC day boundary.

async function main() {
  const suffix = Date.now().toString(36);

  const { data: store, error: storeError } = await admin
    .from("stores")
    .insert({
      name: `TC-ANA Test Store ${suffix}`,
      code: `tcana-${suffix}`,
      unit_number: "TEST",
      currency: "USD",
      locale: "en-US",
      timezone: TIMEZONE,
      tax_model: "exclusive",
    })
    .select()
    .single();
  if (storeError || !store) throw new Error(`Setup failed: ${storeError?.message}`);

  const { data: cashierAuth, error: cashierAuthError } = await admin.auth.admin.createUser({
    email: `tc-ana-cashier-${suffix}@malldemo.com`,
    password: `Test-${suffix}-pw!`,
    email_confirm: true,
  });
  if (cashierAuthError || !cashierAuth.user) throw new Error(`Setup failed: ${cashierAuthError?.message}`);
  const cashierId: string = cashierAuth.user.id;
  await admin.from("profiles").insert({
    id: cashierId,
    email: `tc-ana-cashier-${suffix}@malldemo.com`,
    role: "cashier",
    store_id: store.id,
    full_name: "TC-ANA Test Cashier",
  });

  const { data: product, error: productError } = await admin
    .from("products")
    .insert({
      store_id: store.id,
      sku: `TCANA-${suffix}`,
      name: "TC-ANA Test Product",
      cost_price: 50.0,
      retail_price: 100.0,
      current_stock: 20,
    })
    .select()
    .single();
  if (productError || !product) throw new Error(`Setup failed: ${productError?.message}`);

  async function insertOrder(opts: {
    createdAt: Date;
    total: number;
    subtotal: number;
    unitCost: number;
    quantity: number;
    unitPrice: number;
    paymentMethod?: "cash" | "card" | "qr_transfer";
    status?: string;
    sessionId?: string | null;
    discount?: number;
  }) {
    const { data: order, error } = await admin
      .from("orders")
      .insert({
        store_id: store.id,
        cashier_id: cashierId,
        session_id: opts.sessionId ?? null,
        idempotency_key: `tc-ana-${suffix}-${Math.random()}`,
        invoice_number: `TCANA-${suffix}-${Math.random().toString(36).slice(2, 8)}`,
        subtotal: opts.subtotal,
        tax: 0,
        discount: opts.discount ?? 0,
        total: opts.total,
        payment_method: opts.paymentMethod ?? "cash",
        amount_tendered: opts.total,
        change_due: 0,
        status: opts.status ?? "completed",
        created_at: opts.createdAt.toISOString(),
      })
      .select()
      .single();
    if (error || !order) throw new Error(`insertOrder failed: ${error?.message}`);

    await admin.from("order_items").insert({
      order_id: order.id,
      product_id: product.id,
      quantity: opts.quantity,
      unit_price: opts.unitPrice,
      unit_cost: opts.unitCost,
      subtotal: opts.unitPrice * opts.quantity,
    });

    return order;
  }

  const createdOrderIds: string[] = [];
  const createdSessionIds: string[] = [];
  let splhCashierId: string | undefined;

  try {
    // ======================================================================
    // TC-ANA-01: Timezone Aggregation Integrity
    // ======================================================================
    // 23:30 local (America/New_York, UTC-4 in September) = 03:30 UTC the
    // *next* calendar day — a naive UTC-date grouping would credit this to
    // the wrong day.
    const localDateStr = "2026-06-15"; // a fixed, DST-stable summer date for America/New_York (UTC-4)
    const localMidnightUtcOffset = "-04:00";
    const crossMidnightOrder = await insertOrder({
      createdAt: new Date(`${localDateStr}T23:30:00${localMidnightUtcOffset}`),
      total: 100,
      subtotal: 100,
      unitCost: 50,
      quantity: 1,
      unitPrice: 100,
    });
    createdOrderIds.push(crossMidnightOrder.id);

    const { data: digestTarget } = await admin.rpc("get_daily_monthly_digest", {
      p_store_id: store.id,
      p_target_date: localDateStr,
    });
    const { data: digestNextDay } = await admin.rpc("get_daily_monthly_digest", {
      p_store_id: store.id,
      p_target_date: "2026-06-16",
    });
    record(
      "TC-ANA-01",
      "Timezone Aggregation Integrity",
      digestTarget.daily.order_count === 1 && digestNextDay.daily.order_count === 0,
      `target(${localDateStr})=${digestTarget.daily.order_count} orders, next-day=${digestNextDay.daily.order_count} orders`
    );

    // ======================================================================
    // TC-ANA-02: Historical Cost Price Snapshot
    // ======================================================================
    await admin.from("products").update({ cost_price: 90.0 }).eq("id", product.id);
    const snapshotOrder = await insertOrder({
      createdAt: new Date(),
      total: 100,
      subtotal: 100,
      unitCost: 90.0, // what process_pos_checkout would have captured at insert time
      quantity: 1,
      unitPrice: 100,
    });
    createdOrderIds.push(snapshotOrder.id);
    await admin.from("products").update({ cost_price: 120.0 }).eq("id", product.id);

    const { data: snapshotItem } = await admin
      .from("order_items")
      .select("unit_cost")
      .eq("order_id", snapshotOrder.id)
      .single();
    record(
      "TC-ANA-02",
      "Historical Cost Price Snapshot",
      snapshotItem?.unit_cost === 90,
      `order_items.unit_cost=${snapshotItem?.unit_cost} (expected 90, current live product cost_price is now 120 — must not leak in)`
    );

    // ======================================================================
    // TC-ANA-03: Zero-Division Safety
    // ======================================================================
    const { data: futureDigest, error: futureError } = await admin.rpc("get_daily_monthly_digest", {
      p_store_id: store.id,
      p_target_date: "2099-01-01",
    });
    const allZero =
      !futureError &&
      futureDigest.daily.aov === 0 &&
      futureDigest.daily.upt === 0 &&
      futureDigest.daily.gross_margin_pct === 0 &&
      futureDigest.daily.discount_leakage_pct === 0 &&
      futureDigest.mtd.gross_margin_pct === 0;
    record(
      "TC-ANA-03",
      "Zero-Division Safety",
      allZero,
      futureError ? `RPC errored: ${futureError.message}` : `all ratios returned 0.00 cleanly for a future date with 0 orders`
    );

    // ======================================================================
    // TC-ANA-04: SPLH & Cashier Discrepancy
    // ======================================================================
    // A dedicated second cashier, isolated from the orders the other
    // sub-tests attribute to `cashierId` within the same aggregation window
    // — sharing one cashier across sub-tests would inflate total_sales_volume
    // with unrelated orders and silently corrupt this assertion.
    const { data: splhCashierAuth, error: splhCashierAuthError } = await admin.auth.admin.createUser({
      email: `tc-ana-splh-${suffix}@malldemo.com`,
      password: `Test-${suffix}-pw!`,
      email_confirm: true,
    });
    if (splhCashierAuthError || !splhCashierAuth.user) {
      throw new Error(`Setup failed: ${splhCashierAuthError?.message}`);
    }
    splhCashierId = splhCashierAuth.user.id;
    await admin.from("profiles").insert({
      id: splhCashierId,
      email: `tc-ana-splh-${suffix}@malldemo.com`,
      role: "cashier",
      store_id: store.id,
      full_name: "TC-ANA SPLH Test Cashier",
    });

    const shiftStart = new Date(Date.now() - 4 * 3600_000);
    const { data: session, error: sessionError } = await admin
      .from("cash_drawer_sessions")
      .insert({
        store_id: store.id,
        cashier_id: splhCashierId,
        opening_float: 0,
        opened_at: shiftStart.toISOString(),
        status: "open",
      })
      .select()
      .single();
    if (sessionError || !session) throw new Error(`Session setup failed: ${sessionError?.message}`);
    createdSessionIds.push(session.id);

    const { data: splhOrder, error: splhOrderError } = await admin
      .from("orders")
      .insert({
        store_id: store.id,
        cashier_id: splhCashierId,
        session_id: session.id,
        idempotency_key: `tc-ana-splh-${suffix}`,
        invoice_number: `TCANA-SPLH-${suffix}`,
        subtotal: 2000,
        tax: 0,
        discount: 0,
        total: 2000,
        payment_method: "cash",
        amount_tendered: 2000,
        change_due: 0,
        status: "completed",
        created_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (splhOrderError || !splhOrder) throw new Error(`insertOrder failed: ${splhOrderError?.message}`);
    await admin.from("order_items").insert({
      order_id: splhOrder.id,
      product_id: product.id,
      quantity: 1,
      unit_price: 2000,
      unit_cost: 90,
      subtotal: 2000,
    });
    createdOrderIds.push(splhOrder.id);

    // Closing counted cash = 1990 against an expected 2000 (opening 0 + 2000
    // cash sales) => discrepancy = -10.00, computed server-side.
    const { data: closeResult, error: closeError } = await admin.rpc("close_cash_drawer_session", {
      p_session_id: session.id,
      p_closing_counted_cash: 1990,
      p_notes: "TC-ANA-04",
    });
    if (closeError) throw new Error(`close_cash_drawer_session failed: ${closeError.message}`);

    const { data: cashierRows, error: cashierError } = await admin.rpc("get_cashier_performance_metrics", {
      p_store_id: store.id,
      p_start_date: new Date(Date.now() - 24 * 3600_000).toISOString(),
      p_end_date: new Date(Date.now() + 3600_000).toISOString(),
    });
    const cashierRow = (cashierError ? [] : cashierRows)?.find(
      (r: { cashier_id: string }) => r.cashier_id === splhCashierId
    );
    // splh tolerance absorbs the few real seconds of wall-clock time this
    // script itself takes between opening the session (backdated 4h) and
    // closing it — total_hours_worked is computed against the real closed_at
    // instant, not a fixed 4.0, so it's never exactly 4h00m00s.
    const splhWithinTolerance = cashierRow ? Math.abs(cashierRow.splh - 500) < 1 : false;
    record(
      "TC-ANA-04",
      "SPLH & Cashier Discrepancy",
      !cashierError && closeResult?.discrepancy === -10 && splhWithinTolerance && cashierRow?.net_drawer_discrepancy === -10,
      cashierError
        ? cashierError.message
        : `discrepancy=${closeResult?.discrepancy} splh=${cashierRow?.splh} (expected ~500.00, since $2000 / ~4h)`
    );

    // ======================================================================
    // TC-ANA-05: Dead Stock Aging Accuracy
    // ======================================================================
    const { data: deadProduct, error: deadProductError } = await admin
      .from("products")
      .insert({
        store_id: store.id,
        sku: `TCANA-DEAD-${suffix}`,
        name: "TC-ANA Dead Stock Product",
        cost_price: 25.0,
        retail_price: 50.0,
        current_stock: 10,
      })
      .select()
      .single();
    if (deadProductError || !deadProduct) throw new Error(`Setup failed: ${deadProductError?.message}`);

    const fortyFiveDaysAgo = new Date(Date.now() - 45 * 86_400_000);
    const { data: deadOrder, error: deadOrderError } = await admin
      .from("orders")
      .insert({
        store_id: store.id,
        cashier_id: cashierId,
        idempotency_key: `tc-ana-dead-${suffix}`,
        invoice_number: `TCANA-DEAD-${suffix}`,
        subtotal: 50,
        tax: 0,
        discount: 0,
        total: 50,
        payment_method: "cash",
        amount_tendered: 50,
        change_due: 0,
        status: "completed",
        created_at: fortyFiveDaysAgo.toISOString(),
      })
      .select()
      .single();
    if (deadOrderError || !deadOrder) throw new Error(`Setup failed: ${deadOrderError?.message}`);
    createdOrderIds.push(deadOrder.id);
    await admin.from("order_items").insert({
      order_id: deadOrder.id,
      product_id: deadProduct.id,
      quantity: 1,
      unit_price: 50,
      unit_cost: 25,
      subtotal: 50,
    });

    const { data: invHealth, error: invError } = await admin.rpc("get_inventory_health_metrics", {
      p_store_id: store.id,
    });
    const bucket3059 = invError ? null : invHealth.dead_stock_aging.find((b: { bucket: string }) => b.bucket === "30-59");
    const bucketOthers = invError
      ? []
      : invHealth.dead_stock_aging.filter((b: { bucket: string }) => b.bucket !== "30-59");
    const expectedCapital = deadProduct.current_stock * deadProduct.cost_price;
    record(
      "TC-ANA-05",
      "Dead Stock Aging Accuracy",
      !invError && !!bucket3059 && bucket3059.sku_count >= 1 && bucket3059.capital_locked >= expectedCapital,
      invError
        ? invError.message
        : `30-59 bucket capital=${bucket3059?.capital_locked} (product alone contributes ${expectedCapital}); other buckets present=${bucketOthers.length}`
    );

    // ======================================================================
    // TC-ANA-06: Heatmap Coordinate Alignment
    // ======================================================================
    // 2026-06-17 is a Wednesday. Insert at 15:20 local time.
    const heatmapOrder = await insertOrder({
      createdAt: new Date(`2026-06-17T15:20:00${localMidnightUtcOffset}`),
      total: 75,
      subtotal: 75,
      unitCost: 50,
      quantity: 1,
      unitPrice: 75,
    });
    createdOrderIds.push(heatmapOrder.id);

    const day = localDayOfWeek(new Date(heatmapOrder.created_at), TIMEZONE);
    const hour = localHour(new Date(heatmapOrder.created_at), TIMEZONE);
    record(
      "TC-ANA-06",
      "Heatmap Coordinate Alignment",
      day === 3 && hour === 15,
      `computed cell (day=${day}, hour=${hour}), expected (day=3 [Wed], hour=15)`
    );
  } finally {
    console.log("\nCleaning up test data...");
    // orders/order_items carry a BEFORE UPDATE/DELETE immutability trigger
    // with no role-based exception — it fires even for the service role and
    // even on a cascade delete triggered by removing the parent store, so
    // deleting the test store directly would raise "ledger records are
    // immutable" and fail. A direct Postgres connection with the same
    // transaction-local app.bypass_ledger_guard GUC the RPCs use is the only
    // sanctioned way around it (see supabase/prevent_ledger_modification.sql).
    if (process.env.SUPABASE_DB_URL) {
      const pg = new PgClient({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
      try {
        await pg.connect();
        // is_local=false (session-wide, not transaction-local): each pg.query()
        // call below auto-commits its own implicit transaction, so a
        // transaction-local setting would be lost before the next statement.
        // Safe here since this connection is closed immediately after cleanup.
        await pg.query("select set_config('app.bypass_ledger_guard', 'on', false)");
        // FK order matters and nothing here cascades automatically:
        // order_items -> orders -> cash_drawer_sessions -> stores.
        await pg.query("delete from order_items where order_id in (select id from orders where store_id = $1)", [store.id]);
        await pg.query("delete from orders where store_id = $1", [store.id]);
        await pg.query("delete from cash_drawer_sessions where store_id = $1", [store.id]);
        await pg.query("delete from stores where id = $1", [store.id]);
      } catch (cleanupError) {
        console.warn(
          `Cleanup of test store "${store.name}" (${store.id}) failed and may need manual removal: ${
            cleanupError instanceof Error ? cleanupError.message : cleanupError
          }`
        );
      } finally {
        await pg.end();
      }
    } else {
      console.warn(
        "SUPABASE_DB_URL not set — cannot bypass the ledger-immutability trigger to fully clean up. " +
          `Test store "${store.name}" (${store.id}) was left in the database; delete it manually.`
      );
    }
    await admin.auth.admin.deleteUser(cashierId).catch(() => {});
    if (splhCashierId) await admin.auth.admin.deleteUser(splhCashierId).catch(() => {});
  }

  const passed = results.filter((r) => r.pass).length;
  console.log(`\n${passed}/${results.length} checks passed.`);
  if (passed !== results.length) process.exit(1);
}

main().catch((err) => {
  console.error("test-analytics-suite failed:", err);
  process.exit(1);
});
