import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { StaffManager } from "@/components/dashboard/settings/StaffManager";
import type { StaffMember } from "@/lib/types/domain";

export const dynamic = "force-dynamic";

export default async function UsersSettingsPage() {
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

  const [{ data: staff }, { data: stores }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, email, phone, role, store_id, is_active, created_at")
      .order("created_at", { ascending: false }),
    supabase.from("stores").select("id, name").order("name"),
  ]);

  return (
    <StaffManager staff={(staff ?? []) as StaffMember[]} stores={stores ?? []} />
  );
}
