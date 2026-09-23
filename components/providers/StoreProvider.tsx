"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useTransition,
} from "react";
import { formatCurrency } from "@/lib/utils/currency";
import { syncStoreCatalog } from "@/lib/offline/catalog";
import { switchActiveStore } from "@/lib/actions/store";
import type { Store, UserRole } from "@/lib/types/domain";

interface StoreContextValue {
  storeId: string;
  storeName: string;
  currency: string;
  taxModel: string;
  formatPrice: (amount: number) => string;
  canSwitchStore: boolean;
  stores: Store[];
  switchStore: (storeId: string) => void;
  isSwitching: boolean;
}

const StoreContext = createContext<StoreContextValue | null>(null);

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within a StoreProvider");
  return ctx;
}

interface StoreProviderProps {
  role: UserRole;
  activeStore: Store;
  /** Full store list, only meaningful (and only fetched) for super_admin. */
  stores: Store[];
  children: React.ReactNode;
}

export function StoreProvider({
  role,
  activeStore,
  stores,
  children,
}: StoreProviderProps) {
  const [isPending, startTransition] = useTransition();
  const locale = activeStore.locale ?? "en-US";

  useEffect(() => {
    syncStoreCatalog(activeStore.id).catch((err) => {
      console.error("Failed to sync store catalog offline:", err);
    });
  }, [activeStore.id]);

  const switchStore = useCallback(
    (storeId: string) => {
      if (role !== "super_admin" || storeId === activeStore.id) return;
      startTransition(() => switchActiveStore(storeId));
    },
    [role, activeStore.id]
  );

  const formatPrice = useCallback(
    (amount: number) => formatCurrency(amount, activeStore.currency, locale),
    [activeStore.currency, locale]
  );

  return (
    <StoreContext.Provider
      value={{
        storeId: activeStore.id,
        storeName: activeStore.name,
        currency: activeStore.currency,
        taxModel: activeStore.tax_model,
        formatPrice,
        canSwitchStore: role === "super_admin",
        stores,
        switchStore,
        isSwitching: isPending,
      }}
    >
      {children}
    </StoreContext.Provider>
  );
}
