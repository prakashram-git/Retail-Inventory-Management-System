import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_STORE_COOKIE } from "@/lib/constants";
import { resolveActiveStoreId } from "@/lib/store/resolve-active-store";
import { CustomersManager } from "@/components/dashboard/customers/CustomersManager";
import type { Customer } from "@/lib/types/domain";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const supabase = await createClient();
  const cookieStore = await cookies();

  const { data: userResult } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, store_id")
    .eq("id", userResult.user!.id)
    .single();

  const storeId = profile
    ? await resolveActiveStoreId(supabase, cookieStore.get(ACTIVE_STORE_COOKIE)?.value, profile)
    : null;
  if (!storeId) {
    redirect("/dashboard");
  }

  const { data: customers } = await supabase
    .from("customers")
    .select("id, store_id, full_name, phone, email, notes, is_active, created_at, updated_at")
    .eq("store_id", storeId)
    .order("full_name");

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-semibold">Customers</h1>
        <p className="text-sm text-muted-foreground">
          Registered at checkout or added here — attach a customer to a sale from the POS cart.
        </p>
      </div>

      <CustomersManager customers={(customers ?? []) as Customer[]} />
    </div>
  );
}
