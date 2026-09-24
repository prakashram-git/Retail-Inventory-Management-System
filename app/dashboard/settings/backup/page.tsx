import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BackupManager } from "@/components/dashboard/settings/BackupManager";
import { listArchives } from "@/lib/backup/backupEngine";

export const dynamic = "force-dynamic";

export default async function BackupSettingsPage() {
  const supabase = await createClient();
  const { data: userResult } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userResult.user!.id)
    .single();

  if (profile?.role !== "super_admin") {
    redirect("/dashboard/settings/appearance");
  }

  return <BackupManager initialArchives={listArchives()} />;
}
