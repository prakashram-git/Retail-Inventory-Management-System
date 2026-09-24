import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProfileManagerStudio } from "@/components/dashboard/settings/ProfileManagerStudio";
import { listStoreAssignmentsAction, listStoreProfilesAction } from "@/lib/actions/profileActions";

export const dynamic = "force-dynamic";

export default async function ProfileManagerPage() {
  const supabase = await createClient();
  const { data: userResult } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userResult.user!.id)
    .single();
  if (profile?.role !== "super_admin") redirect("/dashboard");

  const [profiles, stores] = await Promise.all([listStoreProfilesAction(), listStoreAssignmentsAction()]);

  return <ProfileManagerStudio initialProfiles={profiles} initialStores={stores} />;
}
