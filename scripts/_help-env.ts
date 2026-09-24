import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

for (const envFile of [".env.local", ".env"]) {
  const full = path.join(process.cwd(), envFile);
  if (fs.existsSync(full)) process.loadEnvFile(full);
}

export const adminClient = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
