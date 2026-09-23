import { createClient } from "@/lib/supabase/server";
import { AccountSettings } from "@/components/dashboard/settings/AccountSettings";

export const dynamic = "force-dynamic";

export default async function AccountSettingsPage() {
  const supabase = await createClient();
  const { data: userResult } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("phone")
    .eq("id", userResult.user!.id)
    .single();

  return <AccountSettings email={userResult.user?.email ?? ""} phone={profile?.phone ?? null} />;
}
