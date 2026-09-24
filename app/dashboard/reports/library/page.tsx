import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_STORE_COOKIE } from "@/lib/constants";
import { resolveActiveStoreId } from "@/lib/store/resolve-active-store";
import { ReportLibraryClient } from "@/components/reports/ReportLibraryClient";

export const dynamic = "force-dynamic";

/**
 * A separate route from /dashboard/reports rather than replacing it — that
 * page's existing chart-based dashboard (revenue trend, category donut,
 * cashier performance, till sessions, etc.) is a well-built, already-shipped
 * feature; this adds the 24-report catalog/builder alongside it instead of
 * overwriting it.
 */
export default async function ReportLibraryPage() {
  const supabase = await createClient();
  const cookieStore = await cookies();

  const { data: userResult } = await supabase.auth.getUser();
  if (!userResult.user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, store_id")
    .eq("id", userResult.user.id)
    .single();

  const storeId = profile
    ? await resolveActiveStoreId(supabase, cookieStore.get(ACTIVE_STORE_COOKIE)?.value, profile)
    : null;
  if (!storeId) redirect("/dashboard");

  const { data: store } = await supabase.from("stores").select("name, timezone").eq("id", storeId).single();

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-semibold">Report Library</h1>
        <p className="text-sm text-muted-foreground">
          24 report templates across sales, inventory, finance, audit, and staff — customize, save, and export.
        </p>
      </div>
      <ReportLibraryClient
        isSuperAdmin={profile?.role === "super_admin"}
        storeName={store?.name ?? "Store"}
        timezone={store?.timezone ?? "UTC"}
      />
    </div>
  );
}
