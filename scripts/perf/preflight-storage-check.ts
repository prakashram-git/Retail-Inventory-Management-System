#!/usr/bin/env -S npx tsx
/**
 * Pre-flight capacity guard for the Lulu Center performance/stress test suite. Read-only
 * against Postgres; the only write is creating the `product-images` bucket if it's missing
 * (idempotent, and skipped entirely in --dry-run). Never inserts rows, never seeds data —
 * that is scripts/perf/seed-lulu-hypermarket.ts's job, and it must not run until this exits 0.
 *
 *   npx tsx scripts/perf/preflight-storage-check.ts [--dry-run]
 *
 * Exit codes: 0 = PASSED, 1 = FAILED (halt — do not seed), 2 = script/config error.
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { Client as PgClient } from "pg";

for (const f of [".env.local", ".env"]) {
  const full = path.join(process.cwd(), f);
  if (fs.existsSync(full)) process.loadEnvFile(full);
}

const DRY_RUN = process.argv.includes("--dry-run");
const BUCKET = "product-images";
const BUCKET_FILE_SIZE_LIMIT_BYTES = 2 * 1024 * 1024; // 2MB, per spec
const PROJECTED_DB_DELTA_BYTES = 200 * 1024 * 1024; // 10,000 SKUs + 100,000 orders, per spec
const FREE_TIER_DB_LIMIT_BYTES = 500 * 1024 * 1024;
const FREE_TIER_DB_HALT_THRESHOLD_BYTES = 350 * 1024 * 1024;
const LOCAL_UPLOAD_MIN_FREE_BYTES = 1.5 * 1024 * 1024 * 1024;
/**
 * Supabase's dashboard reports a project-wide Storage quota (2GB on Free), not a per-bucket
 * one — there is no API that returns "bytes remaining in this bucket" directly. This script
 * sums the objects already in `product-images` as a proxy for "space this bucket already
 * holds" and treats the REST call's own failure/success as the availability signal; it does
 * not claim to know the account's total remaining Storage quota across all buckets.
 */

interface PreflightResult {
  status: "PASSED" | "FAILED";
  currentDbBytes: number;
  projectedDbDeltaBytes: number;
  bucketUsedBytes: number;
  bucketFileCount: number;
  imageMode: "LOCAL_STORAGE_UPLOAD" | "DETERMINISTIC_CDN_FALLBACK";
  reasons: string[];
}

function mb(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(2);
}

async function inspectDatabase(): Promise<{ bytes: number; readable: string }> {
  const connectionString = process.env.SUPABASE_DB_URL;
  if (!connectionString) throw new Error("SUPABASE_DB_URL is not set — cannot inspect database size.");
  const pg = new PgClient({ connectionString, ssl: { rejectUnauthorized: false } });
  await pg.connect();
  try {
    const { rows } = await pg.query<{ current_db_bytes: string; current_db_readable: string }>(
      `SELECT pg_database_size(current_database()) AS current_db_bytes,
              pg_size_pretty(pg_database_size(current_database())) AS current_db_readable`
    );
    return { bytes: Number(rows[0].current_db_bytes), readable: rows[0].current_db_readable };
  } finally {
    await pg.end();
  }
}

async function inspectBucket(): Promise<{ usedBytes: number; fileCount: number; created: boolean }> {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: bucket, error: getBucketError } = await admin.storage.getBucket(BUCKET);
  let created = false;
  if (!bucket || getBucketError) {
    if (DRY_RUN) {
      console.log(`[dry-run] Bucket "${BUCKET}" is missing — would create it (public, ${BUCKET_FILE_SIZE_LIMIT_BYTES / 1024 / 1024}MB file limit).`);
    } else {
      const { error: createError } = await admin.storage.createBucket(BUCKET, {
        public: true,
        fileSizeLimit: BUCKET_FILE_SIZE_LIMIT_BYTES,
      });
      if (createError && !/already exists/i.test(createError.message)) {
        throw new Error(`Could not create bucket "${BUCKET}": ${createError.message}`);
      }
      created = !createError;
    }
  }

  // Sums recursively (one level of folders deep, matching the lulu/ prefix this suite writes
  // into) — the Storage API lists a bucket's *root* only per call, with no bucket-wide "total
  // size" endpoint.
  let usedBytes = 0;
  let fileCount = 0;
  async function walk(prefix: string) {
    const { data: entries, error } = await admin.storage.from(BUCKET).list(prefix, { limit: 1000 });
    if (error || !entries) return;
    for (const entry of entries) {
      if (entry.id === null) {
        // A "folder" placeholder — list one level down.
        await walk(prefix ? `${prefix}/${entry.name}` : entry.name);
      } else {
        usedBytes += (entry.metadata as { size?: number } | null)?.size ?? 0;
        fileCount++;
      }
    }
  }
  await walk("");

  return { usedBytes, fileCount, created };
}

async function main(): Promise<PreflightResult> {
  const reasons: string[] = [];
  const db = await inspectDatabase();
  const { usedBytes: bucketUsedBytes, fileCount: bucketFileCount, created } = await inspectBucket();
  if (created) reasons.push(`Created missing bucket "${BUCKET}" (public, 2MB file size limit).`);

  const projectedTotal = db.bytes + PROJECTED_DB_DELTA_BYTES;
  const dbSafe = db.bytes < FREE_TIER_DB_HALT_THRESHOLD_BYTES && projectedTotal < FREE_TIER_DB_LIMIT_BYTES;
  if (!dbSafe) {
    reasons.push(
      db.bytes >= FREE_TIER_DB_HALT_THRESHOLD_BYTES
        ? `Current DB size ${mb(db.bytes)}MB already exceeds the ${mb(FREE_TIER_DB_HALT_THRESHOLD_BYTES)}MB halt threshold.`
        : `Projected size ${mb(projectedTotal)}MB (current + ${mb(PROJECTED_DB_DELTA_BYTES)}MB delta) would exceed the ${mb(FREE_TIER_DB_LIMIT_BYTES)}MB Free Tier limit.`
    );
  }

  // Conservative: this script cannot read the account's total remaining Storage quota (see the
  // note on inspectBucket), so it never claims LOCAL_STORAGE_UPLOAD is safe from bucket
  // inspection alone — that decision needs an explicit, human-confirmed quota figure.
  const imageMode: PreflightResult["imageMode"] = "DETERMINISTIC_CDN_FALLBACK";
  reasons.push(
    `Selected DETERMINISTIC_CDN_FALLBACK: this script can measure what's already in "${BUCKET}" (${mb(bucketUsedBytes)}MB across ${bucketFileCount} files) but has no API access to the project's total remaining Storage quota, so it never self-certifies the ${mb(LOCAL_UPLOAD_MIN_FREE_BYTES)}MB+ headroom LOCAL_STORAGE_UPLOAD needs. Confirm the account's actual quota manually before switching modes.`
  );

  const status: PreflightResult["status"] = dbSafe ? "PASSED" : "FAILED";

  console.log("==============================================================");
  console.log("SUPABASE PRE-FLIGHT STORAGE AUDIT REPORT");
  console.log("==============================================================");
  console.log(`Current DB Size:        ${mb(db.bytes)} MB / ${mb(FREE_TIER_DB_LIMIT_BYTES)} MB (Free) or 8192 MB (Pro)`);
  console.log(`Projected DB Delta:     +${mb(PROJECTED_DB_DELTA_BYTES)} MB [${dbSafe ? "SAFE" : "UNSAFE"}]`);
  console.log(`Storage Bucket Usage:   ${mb(bucketUsedBytes)} MB used across ${bucketFileCount} file(s) in "${BUCKET}"`);
  console.log(`Selected Image Mode:    ${imageMode}`);
  console.log(`Audit Status:           ${status} -> ${status === "PASSED" ? "PROCEEDING TO SEEDING" : "HALTED — DO NOT SEED"}`);
  console.log("==============================================================");
  for (const r of reasons) console.log(`  - ${r}`);

  return { status, currentDbBytes: db.bytes, projectedDbDeltaBytes: PROJECTED_DB_DELTA_BYTES, bucketUsedBytes, bucketFileCount, imageMode, reasons };
}

main()
  .then((result) => process.exit(result.status === "PASSED" ? 0 : 1))
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(2);
  });
