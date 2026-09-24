import { NextRequest, NextResponse } from "next/server";
import { executeSnapshot, pruneOldArchives } from "@/lib/backup/backupEngine";

export const runtime = "nodejs";

const RETENTION_DAYS = 14;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await executeSnapshot({ archive: true, retentionDays: RETENTION_DAYS });
    return NextResponse.json({
      ok: true,
      manifest: result.manifest,
      archivePath: result.archivePath,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

/** Exposed for a manual "prune now" trigger from the same cron secret, separate from the dashboard button. */
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const removed = await pruneOldArchives(RETENTION_DAYS);
  return NextResponse.json({ ok: true, removed });
}
