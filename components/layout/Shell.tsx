import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SyncProvider } from "@/components/providers/SyncProvider";
import { StoreProvider } from "@/components/providers/StoreProvider";
import { ACTIVE_STORE_COOKIE } from "@/lib/constants";
import { HelpProvider } from "@/components/help/HelpProvider";
import { SessionProvider } from "@/components/auth/SessionProvider";
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
    .select("id, role, store_id, full_name, email")
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
        <SessionProvider
          user={{ id: profile.id, fullName: profile.full_name, email: profile.email, role: profile.role }}
        >
        <HelpProvider role={profile.role}>
        <div className="flex h-dvh flex-col">
          <Header role={profile.role} />
          <div className="flex min-h-0 min-w-0 flex-1">
            <Sidebar role={profile.role} />
            <main className="min-h-0 min-w-0 flex-1 overflow-y-auto pb-16 md:pb-0">
              {children}
            </main>
          </div>
          <MobileBottomNav role={profile.role} />
        </div>
        </HelpProvider>
        </SessionProvider>
      </StoreProvider>
    </SyncProvider>
  );
}
