import "server-only";
import fs from "node:fs";
import path from "node:path";

let resolvedRoot: string | null = null;

/**
 * Vercel's function filesystem is read-only outside /tmp, and /tmp itself is
 * wiped between invocations/cold starts — so this is a local scratch/staging
 * area, not durable storage. BACKUP_STORAGE_DIR should point at a persistent
 * mount in any environment that has one; local dev just uses ./backups.
 */
export function resolveBackupRoot(): string {
  if (resolvedRoot) return resolvedRoot;

  const configured = process.env.BACKUP_STORAGE_DIR || path.join(process.cwd(), "backups");

  try {
    fs.mkdirSync(configured, { recursive: true });
    fs.accessSync(configured, fs.constants.W_OK);
    resolvedRoot = configured;
    return resolvedRoot;
  } catch {
    const fallback = "/tmp/backups";
    console.warn(
      `[backup] "${configured}" is not writable (read-only filesystem?). ` +
        `Falling back to "${fallback}", which will NOT survive a redeploy or cold start. ` +
        `Set BACKUP_STORAGE_DIR to a persistent mount for real durability.`
    );
    fs.mkdirSync(fallback, { recursive: true });
    resolvedRoot = fallback;
    return resolvedRoot;
  }
}

export function currentDir(): string {
  const dir = path.join(resolveBackupRoot(), "json", "current");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function archivesDir(): string {
  const dir = path.join(resolveBackupRoot(), "json", "archives");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Guards against path traversal when a filename comes from user input (download/restore). */
export function safeArchivePath(filename: string): string {
  const base = path.basename(filename);
  if (base !== filename || !base.endsWith(".tar.gz.enc")) {
    throw new Error("Invalid archive filename");
  }
  return path.join(archivesDir(), base);
}
