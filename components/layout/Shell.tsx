import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SyncProvider } from "@/components/providers/SyncProvider";
import { StoreProvider } from "@/components/providers/StoreProvider";
import { ACTIVE_STORE_COOKIE } from "@/lib/constants";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";
import { MobileBottomNav } from "./MobileBottomNav";
import type { Store } from "@/lib/types/domain";

// Store/session state depends on the request's cookies, so this shell must
// never be statically cached.
export const dynamic = "force-dynamic";

export async function Shell({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, role, store_id, full_name")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    redirect("/login");
  }

  const isSuperAdmin = profile.role === "super_admin";

  let stores: Store[] = [];
  if (isSuperAdmin) {
    const { data } = await supabase
      .from("stores")
      .select("id, name, currency, tax_model, locale")
      .order("name");
    stores = data ?? [];
  }

  const cookieStore = await cookies();
  const cookieStoreId = cookieStore.get(ACTIVE_STORE_COOKIE)?.value;

  const activeStoreId = isSuperAdmin
    ? (cookieStoreId ?? stores[0]?.id)
    : profile.store_id;

  if (!activeStoreId) {
    redirect("/login");
  }

  let activeStore: Store | null =
    stores.find((store) => store.id === activeStoreId) ?? null;

  if (!activeStore) {
    const { data } = await supabase
      .from("stores")
      .select("id, name, currency, tax_model, locale")
      .eq("id", activeStoreId)
      .single();
    activeStore = data;
  }

  if (!activeStore) {
    redirect("/login");
  }

  return (
    <SyncProvider>
      <StoreProvider role={profile.role} activeStore={activeStore} stores={stores}>
        <div className="flex min-h-dvh flex-col">
          <Header />
          <div className="flex flex-1">
            <Sidebar role={profile.role} />
            <main className="flex-1 overflow-y-auto pb-16 md:pb-0">
              {children}
            </main>
          </div>
          <MobileBottomNav role={profile.role} />
        </div>
      </StoreProvider>
    </SyncProvider>
  );
}
