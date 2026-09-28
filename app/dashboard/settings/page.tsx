import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function SettingsIndexPage() {
  // Stores moved to its own top-level route (app/dashboard/stores) — every
  // role that can reach Settings at all has access to Appearance, so it's
  // the one universal landing tab now.
  redirect("/dashboard/settings/appearance");
}
