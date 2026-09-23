import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { StoreManager } from "@/components/dashboard/settings/StoreManager";
import type { StoreDirectoryEntry } from "@/lib/types/domain";

export const dynamic = "force-dynamic";

const STORE_COLUMNS =
  "id, name, code, unit_number, floor_number, currency, locale, timezone, tax_model, is_active, created_at";

export default async function StoresSettingsPage() {
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

  const { data: stores } = await supabase
    .from("stores")
    .select(STORE_COLUMNS)
    .order("name");

  return <StoreManager stores={(stores ?? []) as StoreDirectoryEntry[]} />;
}
