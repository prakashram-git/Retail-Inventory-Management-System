import "server-only";

/**
 * Cold-vault sync is intentionally not wired up yet (local-disk backups only, per current
 * setup) — Vercel's filesystem is ephemeral, so archives written there do not survive a
 * redeploy or cold start. This stub exists so `backupEngine.ts` has a stable extension point:
 * once BACKUP_S3_BUCKET (+ endpoint/credentials) is available, implement the PUT here using
 * the S3-compatible provider's SDK and call it from `executeSnapshot`.
 */
export async function uploadToS3CompatibleVault(archivePath: string): Promise<void> {
  const bucket = process.env.BACKUP_S3_BUCKET;
  if (!bucket) {
    return;
  }
  throw new Error(
    `BACKUP_S3_BUCKET is set to "${bucket}" but cold-vault upload is not implemented yet ` +
      `(archive left on local disk at ${archivePath}). Wire up an S3-compatible client here.`
  );
}
