import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_STORE_COOKIE } from "@/lib/constants";
import { resolveActiveStoreId } from "@/lib/store/resolve-active-store";
import { resolveDashboardLayout } from "@/lib/dashboard/resolve-layout";
import { LayoutBuilder } from "@/components/dashboard/settings/LayoutBuilder";
import type { UserRole } from "@/lib/types/domain";

export const dynamic = "force-dynamic";

export default async function LayoutBuilderPage() {
  const supabase = await createClient();
  const cookieStore = await cookies();

  const { data: userResult } = await supabase.auth.getUser();
  if (!userResult.user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, store_id")
    .eq("id", userResult.user.id)
    .single();

  const role = (profile?.role ?? null) as UserRole | null;
  if (role !== "super_admin" && role !== "ui_designer") {
    redirect("/dashboard");
  }

  const storeId = profile
    ? await resolveActiveStoreId(supabase, cookieStore.get(ACTIVE_STORE_COOKIE)?.value, profile)
    : null;

  const resolved = await resolveDashboardLayout(supabase, storeId);

  return (
    <LayoutBuilder
      initialLayoutConfig={resolved.layoutConfig}
      initialThemeConfig={resolved.themeConfig}
      canEditGlobal={role === "super_admin"}
      isCustom={resolved.isCustom}
    />
  );
}
