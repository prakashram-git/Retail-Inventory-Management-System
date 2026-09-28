import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { StoreManager } from "@/components/dashboard/stores/StoreManager";
import type { StoreDirectoryEntry } from "@/lib/types/domain";

export const dynamic = "force-dynamic";

const STORE_COLUMNS =
  "id, name, code, unit_number, floor_number, currency, locale, timezone, tax_model, is_active, created_at";

export default async function StoresPage() {
  const supabase = await createClient();
  const { data: userResult } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userResult.user!.id)
    .single();

  // Store directory management is mall-wide, super_admin only — same
  // boundary this page already enforced under Settings, just now its own
  // top-level route instead of a Settings tab (onboarding a new store is
  // frequent enough, and foundational enough, to not be buried there).
  if (profile?.role !== "super_admin") {
    redirect("/dashboard");
  }

  const { data: stores } = await supabase
    .from("stores")
    .select(STORE_COLUMNS)
    .order("name");

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-semibold">Stores</h1>
        <p className="text-sm text-muted-foreground">
          The mall&apos;s store directory — onboard new units and manage currency, timezone, and tax settings per store.
        </p>
      </div>

      <StoreManager stores={(stores ?? []) as StoreDirectoryEntry[]} />
    </div>
  );
}
