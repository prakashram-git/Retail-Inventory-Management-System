#!/usr/bin/env -S npx tsx
/**
 * Requires supabase/analytics_foundation.sql (unit_cost, RLS hardening) and
 * supabase/analytics_rpcs.sql (get_cashier_performance_metrics) to already
 * be applied. Uses the service-role client directly (bypasses RLS, same as
 * every other test script in this repo) so the report runners are exercised
 * against real disposable data.
 */
import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { createClient } from "@supabase/supabase-js";
import { Client as PgClient } from "pg";
import { REPORT_CATALOG } from "../lib/reports/catalog";
import { runReport } from "../lib/reports/queryRunner";
import { buildCsvString, buildExcelWorkbook } from "../lib/reports/exporter";
import { runAuditReport } from "../lib/reports/runners/audit";
import { getReportDefinition } from "../lib/reports/catalog";

for (const envFile of [".env.local", ".env"]) {
  const full = path.join(process.cwd(), envFile);
  if (fs.existsSync(full)) process.loadEnvFile(full);
}

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

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

function tcCatalogCoverage() {
  const missing: string[] = [];
  const ids = new Set<string>();
  for (const report of REPORT_CATALOG) {
    if (ids.has(report.id)) missing.push(`duplicate id ${report.id}`);
    ids.add(report.id);
    if (!report.columns || report.columns.length === 0) missing.push(`${report.id} has no columns`);
    if (!report.title || !report.description) missing.push(`${report.id} missing title/description`);
  }
  record(
    "TC-REP-01",
    "Catalog Coverage",
    REPORT_CATALOG.length === 24 && missing.length === 0,
    `${REPORT_CATALOG.length}/24 reports registered${missing.length ? `, issues: ${missing.join("; ")}` : ", all have non-empty column arrays"}`
  );
}

function tcCsvFormulaInjectionGuard() {
  const maliciousSku = "=cmd|' /C calc'!A0";
  const csv = buildCsvString(
    [
      { key: "sku", label: "SKU", type: "string" },
      { key: "name", label: "Name", type: "string" },
    ],
    [{ sku: maliciousSku, name: "Test Product" }]
  );
  const dataLine = csv.split("\r\n")[1];
  const firstCell = dataLine.split(",")[0];
  record(
    "TC-REP-02",
    "CSV Formula Injection Guard",
    firstCell === `'${maliciousSku}`,
    `cell value: ${firstCell}`
  );
}

async function tcExcelStructureVerification() {
  const columns = [
    { key: "sku", label: "SKU", type: "string" as const },
    { key: "revenue", label: "Revenue", type: "currency" as const },
  ];
  const { buffer } = await buildExcelWorkbook(columns, [{ sku: "ABC-1", revenue: 42.5 }], "Test Sheet");

  const reparsed = new ExcelJS.Workbook();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await reparsed.xlsx.load(buffer as any);
  const sheet = reparsed.worksheets[0];
  const headerRow = sheet.getRow(1).values as unknown[];
  const headers = headerRow.slice(1).map(String);
  const dataRow = sheet.getRow(2).values as unknown[];

  record(
    "TC-REP-03",
    "Excel Structure Verification",
    sheet.name === "Test Sheet" && headers.includes("SKU") && headers.includes("Revenue") && dataRow[1] === "ABC-1",
    `sheet="${sheet.name}" headers=${JSON.stringify(headers)} parsedCleanly=true`
  );
}

async function tcZeroDivisionSafety(storeId: string) {
  try {
    const sellThrough = await runReport(admin, {
      reportId: "REP-INV-04",
      storeId,
      storeIds: [storeId],
      startDate: new Date(Date.now() - 30 * 86_400_000).toISOString(),
      endDate: new Date().toISOString(),
      timezone: "UTC",
    });
    const splh = await runReport(admin, {
      reportId: "REP-STF-02",
      storeId,
      storeIds: [storeId],
      startDate: new Date(Date.now() - 7 * 86_400_000).toISOString(),
      endDate: new Date().toISOString(),
      timezone: "UTC",
    });
    const badSellThrough = sellThrough.rows.some(
      (r) => typeof r.sell_through_pct === "number" && !Number.isFinite(r.sell_through_pct)
    );
    const badSplh = splh.rows.some((r) => typeof r.splh === "number" && !Number.isFinite(r.splh));
    record(
      "TC-REP-04",
      "Division-by-Zero Safety",
      !badSellThrough && !badSplh,
      `REP-INV-04 rows=${sellThrough.rows.length} (no NaN/Infinity), REP-STF-02 rows=${splh.rows.length} (no NaN/Infinity)`
    );
  } catch (err) {
    record("TC-REP-04", "Division-by-Zero Safety", false, `Threw: ${err instanceof Error ? err.message : err}`);
  }
}

async function tcShaAuditVerification(storeId: string, suffix: string) {
  const cashier = await admin.auth.admin.createUser({
    email: `tc-rep-cashier-${suffix}@malldemo.com`,
    password: `Test-${suffix}-pw!`,
    email_confirm: true,
  });
  if (cashier.error || !cashier.data.user) {
    record("TC-REP-05", "SHA-256 Audit Verification", false, `Setup failed: ${cashier.error?.message}`);
    return null;
  }
  const cashierId = cashier.data.user.id;
  await admin.from("profiles").insert({
    id: cashierId,
    email: `tc-rep-cashier-${suffix}@malldemo.com`,
    role: "cashier",
    store_id: storeId,
    full_name: "TC-REP Test Cashier",
  });

  async function insertOrder(total: number) {
    const { data, error } = await admin
      .from("orders")
      .insert({
        store_id: storeId,
        cashier_id: cashierId,
        idempotency_key: `tc-rep-${suffix}-${Math.random()}`,
        invoice_number: `TCREP-${suffix}-${Math.random().toString(36).slice(2, 8)}`,
        subtotal: total,
        tax: 0,
        discount: 0,
        total,
        payment_method: "cash",
        amount_tendered: total,
        change_due: 0,
        status: "completed",
      })
      .select("id, invoice_number, created_at, previous_order_hash, current_order_hash")
      .single();
    if (error || !data) throw new Error(`insertOrder failed: ${error?.message}`);
    return data;
  }

  // Sequential real inserts so the trg_order_fiscal_hash trigger chains them
  // for real — the hash values here are genuine, not hand-constructed.
  const order1 = await insertOrder(10);
  const order2 = await insertOrder(20);
  const order3 = await insertOrder(30);

  const params = {
    storeId,
    storeIds: [storeId],
    startDate: new Date(Date.now() - 3600_000).toISOString(),
    endDate: new Date(Date.now() + 3600_000).toISOString(),
    timezone: "UTC",
  };

  const cleanResult = await runAuditReport(admin, getReportDefinition("REP-AUD-04")!, {
    reportId: "REP-AUD-04",
    ...params,
  });
  const cleanStatuses = cleanResult.rows.map((r) => r.chain_status);
  const cleanOk =
    cleanStatuses[0] === "First order in range — no prior hash to verify" &&
    cleanStatuses[1] === "Verified" &&
    cleanStatuses[2] === "Verified";

  // Tamper order2's hash (bypassing the immutability trigger, the same way
  // every other test script in this repo does for disposable test cleanup)
  // to verify the chain check actually detects a break, not just happy path.
  let tamperedOk = false;
  if (process.env.SUPABASE_DB_URL) {
    const pg = new PgClient({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
    await pg.connect();
    try {
      await pg.query("select set_config('app.bypass_ledger_guard', 'on', false)");
      await pg.query("update orders set current_order_hash = $1 where id = $2", ["TAMPERED_HASH", order2.id]);
      const tamperedResult = await runAuditReport(admin, getReportDefinition("REP-AUD-04")!, {
        reportId: "REP-AUD-04",
        ...params,
      });
      tamperedOk = tamperedResult.rows[2]?.chain_status === "BROKEN — hash mismatch";
    } finally {
      await pg.end();
    }
  }

  record(
    "TC-REP-05",
    "SHA-256 Audit Verification",
    cleanOk && (process.env.SUPABASE_DB_URL ? tamperedOk : true),
    `clean chain: ${JSON.stringify(cleanStatuses)}${process.env.SUPABASE_DB_URL ? `, tamper detected: ${tamperedOk}` : " (SUPABASE_DB_URL not set — tamper-detection half skipped)"}`
  );

  return { cashierId, orderIds: [order1.id, order2.id, order3.id] };
}

async function main() {
  tcCatalogCoverage();
  tcCsvFormulaInjectionGuard();
  await tcExcelStructureVerification();

  const suffix = Date.now().toString(36);
  const { data: store, error: storeError } = await admin
    .from("stores")
    .insert({
      name: `TC-REP Test Store ${suffix}`,
      code: `tcrep-${suffix}`,
      unit_number: "TEST",
      currency: "USD",
      locale: "en-US",
      timezone: "UTC",
      tax_model: "exclusive",
    })
    .select()
    .single();
  if (storeError || !store) {
    console.error("Setup failed:", storeError?.message);
    process.exit(1);
  }

  // A zero-stock, zero-sales product specifically to hit the
  // sell-through-rate 0/0 denominator branch.
  await admin.from("products").insert({
    store_id: store.id,
    sku: `TCREP-ZERO-${suffix}`,
    name: "Zero Activity Product",
    cost_price: 10,
    retail_price: 20,
    current_stock: 0,
  });

  let cashierId: string | undefined;
  try {
    await tcZeroDivisionSafety(store.id);
    const shaSetup = await tcShaAuditVerification(store.id, suffix);
    cashierId = shaSetup?.cashierId;
  } finally {
    console.log("\nCleaning up test data...");
    if (process.env.SUPABASE_DB_URL) {
      const pg = new PgClient({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
      try {
        await pg.connect();
        await pg.query("select set_config('app.bypass_ledger_guard', 'on', false)");
        await pg.query("delete from order_items where order_id in (select id from orders where store_id = $1)", [store.id]);
        await pg.query("delete from orders where store_id = $1", [store.id]);
        await pg.query("delete from cash_drawer_sessions where store_id = $1", [store.id]);
        await pg.query("delete from stores where id = $1", [store.id]);
      } catch (cleanupError) {
        console.warn(`Cleanup failed, may need manual removal of store ${store.id}: ${cleanupError instanceof Error ? cleanupError.message : cleanupError}`);
      } finally {
        await pg.end();
      }
    } else {
      console.warn(`SUPABASE_DB_URL not set — test store ${store.id} left in the database; delete it manually.`);
    }
    if (cashierId) await admin.auth.admin.deleteUser(cashierId).catch(() => {});
  }

  const passed = results.filter((r) => r.pass).length;
  console.log(`\n${passed}/${results.length} checks passed.`);
  if (passed !== results.length) process.exit(1);
}

main().catch((err) => {
  console.error("test-reporting-suite failed:", err);
  process.exit(1);
});
