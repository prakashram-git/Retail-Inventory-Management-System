#!/usr/bin/env -S npx tsx
import fs from "node:fs";
import path from "node:path";

for (const envFile of [".env.local", ".env"]) {
  const full = path.join(process.cwd(), envFile);
  if (fs.existsSync(full)) process.loadEnvFile(full);
}

import { executeSnapshot, executeRestore, listArchives, pruneOldArchives } from "../lib/backup/backupEngine";

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function value(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

async function main() {
  if (flag("snapshot")) {
    const result = await executeSnapshot({
      archive: flag("archive") || flag("encrypt"),
      retentionDays: value("retention") ? Number(value("retention")) : 14,
    });
    console.log("Snapshot complete:", JSON.stringify(result, null, 2));
    return;
  }

  if (flag("list")) {
    console.log(JSON.stringify(listArchives(), null, 2));
    return;
  }

  const restoreFile = value("restore");
  if (restoreFile) {
    const result = await executeRestore(restoreFile, {
      dryRun: !flag("apply"),
      targetStoreId: value("store"),
    });
    console.log(JSON.stringify(result, null, 2));
    if (!flag("apply")) {
      console.log('\n(dry run — pass --apply to actually write to the database)');
    }
    return;
  }

  const pruneDays = value("prune");
  if (pruneDays) {
    const removed = await pruneOldArchives(Number(pruneDays));
    console.log("Pruned:", removed);
    return;
  }

  console.log(
    "Usage:\n" +
      "  npx tsx scripts/backup-cli.ts --snapshot [--archive] [--retention=14]\n" +
      "  npx tsx scripts/backup-cli.ts --list\n" +
      "  npx tsx scripts/backup-cli.ts --restore=<path> [--apply] [--store=<id>]\n" +
      "  npx tsx scripts/backup-cli.ts --prune=<days>"
  );
}

main().catch((error) => {
  console.error("backup-cli failed:", error);
  process.exit(1);
});
