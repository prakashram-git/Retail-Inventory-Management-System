import { createClient } from "@/lib/supabase/server";
import { AppearanceEditor } from "@/components/dashboard/settings/AppearanceEditor";
import { TypographySettingsCard } from "@/components/dashboard/settings/TypographySettingsCard";
import { getTypographySettings } from "@/lib/theme/typography";

export const dynamic = "force-dynamic";

const SETTINGS_COLUMNS = "home_background_url, blur_strength, overlay_opacity";

export default async function AppearanceSettingsPage() {
  const supabase = await createClient();
  const { data: userResult } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, store_id")
    .eq("id", userResult.user!.id)
    .single();

  const isSuperAdmin = profile?.role === "super_admin";
  const scope = isSuperAdmin ? "global" : "store";
  const storeId = isSuperAdmin ? null : (profile?.store_id ?? null);

  let query = supabase.from("system_settings").select(SETTINGS_COLUMNS);
  query = storeId ? query.eq("store_id", storeId) : query.is("store_id", null);
  const { data: settings } = await query.maybeSingle();

  const typography = isSuperAdmin ? await getTypographySettings(supabase) : null;

  return (
    <div className="flex flex-col gap-6">
      <AppearanceEditor
        scope={scope}
        uploadStoreId={storeId ?? "global"}
        initial={{
          home_background_url: settings?.home_background_url ?? "",
          blur_strength: settings?.blur_strength ?? 24,
          overlay_opacity: settings?.overlay_opacity ?? 0.45,
        }}
      />
      {typography && <TypographySettingsCard initial={typography} />}
    </div>
  );
}
