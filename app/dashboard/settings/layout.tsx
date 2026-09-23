import { createClient } from "@/lib/supabase/server";
import { SettingsTabs } from "@/components/dashboard/settings/SettingsTabs";
import type { UserRole } from "@/lib/types/domain";

export const dynamic = "force-dynamic";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: userResult } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userResult.user!.id)
    .single();

  const role = (profile?.role ?? "cashier") as UserRole;

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage stores, appearance, and staff access across the mall.
        </p>
      </div>

      <SettingsTabs role={role} />

      {children}
    </div>
  );
}
