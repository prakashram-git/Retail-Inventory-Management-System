"use server";

import { requireSuperAdmin } from "./shared";
import { executeSnapshot, executeRestore, listArchives, pruneOldArchives } from "@/lib/backup/backupEngine";
import { safeArchivePath } from "@/lib/backup/paths";

const DEFAULT_RETENTION_DAYS = 14;

export async function triggerSnapshot(archive: boolean) {
  await requireSuperAdmin();
  return executeSnapshot({ archive, retentionDays: archive ? DEFAULT_RETENTION_DAYS : undefined });
}

export async function getArchiveList() {
  await requireSuperAdmin();
  return listArchives();
}

export async function restoreFromArchive(filename: string, confirmationPhrase: string, dryRun: boolean) {
  await requireSuperAdmin();
  if (!dryRun && confirmationPhrase !== "CONFIRM-RESTORE") {
    throw new Error('Type "CONFIRM-RESTORE" exactly to run a real restore.');
  }
  const archivePath = safeArchivePath(filename);
  return executeRestore(archivePath, { dryRun });
}

export async function pruneArchivesNow(retentionDays: number) {
  await requireSuperAdmin();
  return pruneOldArchives(retentionDays);
}
