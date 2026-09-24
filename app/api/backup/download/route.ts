import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import { requireSuperAdmin } from "@/lib/actions/shared";
import { safeArchivePath } from "@/lib/backup/paths";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    await requireSuperAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const filename = request.nextUrl.searchParams.get("file");
  if (!filename) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }

  let fullPath: string;
  try {
    fullPath = safeArchivePath(filename);
  } catch {
    return NextResponse.json({ error: "Invalid file" }, { status: 400 });
  }

  if (!fs.existsSync(fullPath)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const buffer = await fs.promises.readFile(fullPath);
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
