import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_STORE_COOKIE } from "@/lib/constants";
import { resolveActiveStoreId } from "@/lib/store/resolve-active-store";
import { getTerminalLockSettings } from "@/lib/terminal-lock/settings";
import { TerminalLockSettingsCard } from "@/components/dashboard/settings/TerminalLockSettingsCard";

export const dynamic = "force-dynamic";

export default async function TerminalLockSettingsPage() {
  const supabase = await createClient();
  const cookieStore = await cookies();
  const { data: userResult } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, store_id")
    .eq("id", userResult.user!.id)
    .single();

  if (profile?.role !== "super_admin") {
    redirect("/dashboard/settings/appearance");
  }

  const storeId = await resolveActiveStoreId(
    supabase,
    cookieStore.get(ACTIVE_STORE_COOKIE)?.value,
    profile
  );
  if (!storeId) {
    redirect("/dashboard/stores");
  }

  const [{ data: store }, settings] = await Promise.all([
    supabase.from("stores").select("name").eq("id", storeId).single(),
    getTerminalLockSettings(supabase, storeId),
  ]);

  return (
    <TerminalLockSettingsCard
      storeId={storeId}
      storeName={store?.name ?? "This store"}
      initialSettings={settings}
    />
  );
}
