import "server-only";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import * as tar from "tar";
import { createAdminClient } from "@/lib/supabase/admin";
import { currentDir, archivesDir } from "./paths";
import { writeJsonEntity, truncateJsonlEntity, appendJsonlEntity } from "./fileManager";
import { redactRecord } from "./redact";
import { encryptArchiveFile, decryptArchiveFile, sha256File } from "./crypto";
import { uploadToS3CompatibleVault } from "./s3";

/** Low-churn config/reference data — one JSON array per table, rewritten wholesale each run. */
const DIMENSION_ENTITIES = ["stores", "system_settings", "profiles", "categories", "products"] as const;

/**
 * High-volume transactional history. Snapshot mode rewrites the .jsonl as a full point-in-time
 * export (that's what "on-demand full snapshot" means); ongoing CDC appends via
 * appendJsonlEntity() are a separate, additive path (fileManager.ts) not invoked here.
 */
const LEDGER_ENTITIES = ["cash_drawer_sessions", "orders", "order_items", "inventory_logs"] as const;

/** FK-dependency order for restore — parents before children. */
const RESTORE_ORDER = [
  "stores",
  "system_settings",
  "profiles",
  "categories",
  "products",
  "cash_drawer_sessions",
  "orders",
  "order_items",
  "inventory_logs",
] as const;

type EntityName = (typeof RESTORE_ORDER)[number];

interface ManifestEntry {
  file: string;
  rows: number;
  sha256: string;
}

interface Manifest {
  generated_at: string;
  entities: Record<string, ManifestEntry>;
}

async function fetchTable(entity: string): Promise<Record<string, unknown>[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.from(entity).select("*");
  if (error) throw new Error(`Failed to read ${entity}: ${error.message}`);
  return (data ?? []).map((row) => redactRecord(row as Record<string, unknown>));
}

async function writeManifest(): Promise<Manifest> {
  const dir = currentDir();
  const manifest: Manifest = { generated_at: new Date().toISOString(), entities: {} };

  for (const entity of [...DIMENSION_ENTITIES]) {
    const file = `${entity}.json`;
    const full = path.join(dir, file);
    if (!fs.existsSync(full)) continue;
    const rows = JSON.parse(fs.readFileSync(full, "utf8") || "[]").length;
    manifest.entities[entity] = { file, rows, sha256: await sha256File(full) };
  }
  for (const entity of [...LEDGER_ENTITIES]) {
    const file = `${entity}.jsonl`;
    const full = path.join(dir, file);
    if (!fs.existsSync(full)) continue;
    const rows = fs
      .readFileSync(full, "utf8")
      .split("\n")
      .filter((l) => l.trim()).length;
    manifest.entities[entity] = { file, rows, sha256: await sha256File(full) };
  }

  fs.writeFileSync(path.join(dir, "_manifest.json"), JSON.stringify(manifest, null, 2));
  return manifest;
}

export interface SnapshotResult {
  manifest: Manifest;
  archivePath?: string;
  archiveSha256?: string;
}

export async function executeSnapshot(
  options: { archive?: boolean; retentionDays?: number } = {}
): Promise<SnapshotResult> {
  for (const entity of DIMENSION_ENTITIES) {
    const rows = await fetchTable(entity);
    await writeJsonEntity(entity, rows);
  }

  for (const entity of LEDGER_ENTITIES) {
    const rows = await fetchTable(entity);
    await truncateJsonlEntity(entity);
    for (const row of rows) {
      await appendJsonlEntity(entity, row);
    }
  }

  const manifest = await writeManifest();
  const result: SnapshotResult = { manifest };

  if (options.archive) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const tmpTar = path.join(os.tmpdir(), `backup-${timestamp}.tar`);
    const archivePath = path.join(archivesDir(), `${timestamp}.tar.gz.enc`);

    await tar.c({ file: tmpTar, cwd: currentDir() }, fs.readdirSync(currentDir()));
    await encryptArchiveFile(tmpTar, archivePath);
    await fs.promises.unlink(tmpTar);

    result.archivePath = archivePath;
    result.archiveSha256 = await sha256File(archivePath);

    if (options.retentionDays) {
      await pruneOldArchives(options.retentionDays);
    }
    await uploadToS3CompatibleVault(archivePath);
  }

  return result;
}

export async function pruneOldArchives(retentionDays: number): Promise<string[]> {
  const dir = archivesDir();
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const removed: string[] = [];

  for (const name of await fs.promises.readdir(dir)) {
    if (!name.endsWith(".tar.gz.enc")) continue;
    const full = path.join(dir, name);
    const stat = await fs.promises.stat(full);
    if (stat.mtimeMs < cutoff) {
      await fs.promises.unlink(full);
      removed.push(name);
    }
  }
  return removed;
}

export function listArchives() {
  const dir = archivesDir();
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".tar.gz.enc"))
    .map((name) => {
      const full = path.join(dir, name);
      const stat = fs.statSync(full);
      return { name, sizeBytes: stat.size, createdAt: stat.mtime.toISOString() };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

interface RestoreReport {
  table: string;
  rows: number;
  written: number;
  errors: string[];
}

export async function executeRestore(
  archivePath: string,
  options: { dryRun: boolean; targetStoreId?: string }
): Promise<{ manifest: Manifest; reports: RestoreReport[] }> {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "restore-"));
  const tmpTar = path.join(workDir, "bundle.tar");

  try {
    await decryptArchiveFile(archivePath, tmpTar);
    await tar.x({ file: tmpTar, cwd: workDir });

    const manifestPath = path.join(workDir, "_manifest.json");
    if (!fs.existsSync(manifestPath)) {
      throw new Error("Archive is missing _manifest.json — refusing to restore an unverifiable bundle");
    }
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Manifest;

    for (const [entity, entry] of Object.entries(manifest.entities)) {
      const full = path.join(workDir, entry.file);
      if (!fs.existsSync(full)) {
        throw new Error(`Manifest references ${entry.file} but it is missing from the archive`);
      }
      const actualSha = await sha256File(full);
      if (actualSha !== entry.sha256) {
        throw new Error(`Checksum mismatch for ${entity} (${entry.file}) — archive may be corrupted or tampered`);
      }
    }

    const admin = createAdminClient();
    const reports: RestoreReport[] = [];

    for (const entity of RESTORE_ORDER) {
      const entry = manifest.entities[entity];
      if (!entry) continue;

      const full = path.join(workDir, entry.file);
      const isLedger = (LEDGER_ENTITIES as readonly string[]).includes(entity);
      let rows: Record<string, unknown>[] = isLedger
        ? fs
            .readFileSync(full, "utf8")
            .split("\n")
            .filter((l) => l.trim())
            .map((l) => JSON.parse(l))
        : JSON.parse(fs.readFileSync(full, "utf8") || "[]");

      if (options.targetStoreId && rows.length && "store_id" in rows[0]) {
        rows = rows.filter((row) => row.store_id === options.targetStoreId);
      }

      const report: RestoreReport = { table: entity, rows: rows.length, written: 0, errors: [] };

      if (!options.dryRun) {
        const CHUNK = 500;
        for (let i = 0; i < rows.length; i += CHUNK) {
          const chunk = rows.slice(i, i + CHUNK);
          if (isLedger) {
            const { data, error } = await admin.rpc("restore_upsert_ledger", {
              p_table: entity,
              p_rows: chunk,
            });
            if (error) report.errors.push(error.message);
            else report.written += (data as { rows_written: number })?.rows_written ?? chunk.length;
          } else {
            const { error } = await admin.from(entity).upsert(chunk, { onConflict: "id" });
            if (error) report.errors.push(error.message);
            else report.written += chunk.length;
          }
        }
      }

      reports.push(report);
    }

    return { manifest, reports };
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

export type { EntityName, Manifest };
