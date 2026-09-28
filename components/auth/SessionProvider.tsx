"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { logout } from "@/lib/actions/auth";
import { broadcastForceLogout, listenForForceLogout } from "@/lib/auth/authChannel";
import { getPendingSyncCount } from "@/lib/offline/sync";
import { useSync } from "@/components/providers/SyncProvider";
import { getOpenSession } from "@/lib/pos/session";
import { clearParkedCart, parkCart } from "@/lib/pos/parkedCart";
import { logLockEvent } from "@/lib/pos/lockAudit";
import { createClient } from "@/lib/supabase/client";
import { ACTIVE_STORE_COOKIE } from "@/lib/constants";
import { useStore } from "@/components/providers/StoreProvider";
import type { CartLine } from "@/lib/pos/types";
import type { UserRole } from "@/lib/types/domain";
import { LogoutConfirmDialog, type SignOutChecks } from "./LogoutConfirmDialog";
import { LockOverlay } from "./LockOverlay";

export interface SessionUser {
  id: string;
  fullName: string | null;
  email: string;
  role: UserRole;
}

/** What the POS terminal tells the guard so sign-out can inspect it. */
export interface PosSnapshot {
  cart: CartLine[];
  drawerOpen: boolean;
  unitNumber: string | null;
  /** Cart grand total (tax/discount applied), for the sign-out warning. */
  cartTotal: number;
}

/** Why the terminal locked, for the audit trail and lock-screen copy. */
export type LockReason = "inactivity" | "order_completed" | "drawer_closed" | "manual";

interface SessionGuardValue {
  user: SessionUser;
  unitNumber: string | null;
  locked: boolean;
  lockReason: LockReason | null;
  lockedAt: number | null;
  lock: (reason?: LockReason) => void;
  unlock: () => void;
  /** Runs the safety checks, then opens the confirmation dialog. */
  requestSignOut: (returnFocusTo?: HTMLElement | null) => Promise<void>;
  /** Skips the dialog; used by the lock screen's "sign out". */
  signOutNow: () => Promise<void>;
  registerPos: (snapshot: PosSnapshot | null) => void;
}

const SessionGuardContext = createContext<SessionGuardValue | null>(null);

export function useSessionGuard() {
  const ctx = useContext(SessionGuardContext);
  if (!ctx) throw new Error("useSessionGuard must be used within a SessionProvider");
  return ctx;
}

export function SessionProvider({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  const { storeId, storeName } = useStore();
  const { triggerSync } = useSync();
  const [locked, setLocked] = useState(false);
  const [lockReason, setLockReason] = useState<LockReason | null>(null);
  const [lockedAt, setLockedAt] = useState<number | null>(null);
  const [pos, setPos] = useState<PosSnapshot | null>(null);
  const [checks, setChecks] = useState<SignOutChecks | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const posRef = useRef<PosSnapshot | null>(null);
  // Written synchronously (not via an effect) so a shortcut pressed right
  // after a cart change never inspects a stale snapshot.
  const registerPos = useCallback((snapshot: PosSnapshot | null) => {
    posRef.current = snapshot;
    setPos(snapshot);
  }, []);

  const teardown = useCallback(async () => {
    let redirectUrl = "/login";
    try {
      redirectUrl = (await logout()).redirectUrl;
    } catch {
      // Offline (server action unreachable): clear this device's session
      // client-side. scope:'local' again leaves other devices untouched.
      await createClient().auth.signOut({ scope: "local" }).catch(() => {});
      document.cookie = `${ACTIVE_STORE_COOKIE}=; Max-Age=0; path=/`;
    }
    broadcastForceLogout();
    // Full page load: drops all in-memory React state and Dexie listeners.
    window.location.href = redirectUrl;
  }, []);

  const requestSignOut = useCallback(
    async (returnFocusTo?: HTMLElement | null) => {
      returnFocusRef.current = returnFocusTo ?? (document.activeElement as HTMLElement | null);
      const snapshot = posRef.current;

      const pendingCount = await getPendingSyncCount().catch(() => 0);
      // Off the POS screen the drawer state needs a network call; never let a
      // dead connection stall the dialog — skip it offline, cap it at 2s online.
      const drawerOpen =
        snapshot?.drawerOpen ??
        (navigator.onLine
          ? await Promise.race([
              getOpenSession(storeId, user.id).then((s) => s !== null),
              new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 2000)),
            ]).catch(() => false)
          : false);

      setChecks({
        cartItemCount: snapshot?.cart.reduce((sum, l) => sum + l.quantity, 0) ?? 0,
        cartTotal: snapshot?.cartTotal ?? 0,
        canPark: !!snapshot && snapshot.cart.length > 0,
        drawerOpen,
        pendingOfflineCount: pendingCount,
      });
      setDialogOpen(true);
    },
    [storeId, user.id]
  );

  const syncNow = useCallback(async () => {
    if (!navigator.onLine) {
      toast.error("You're offline — reconnect to sync.");
      return;
    }
    await triggerSync();
    const remaining = await getPendingSyncCount().catch(() => 0);
    setChecks((prev) => (prev ? { ...prev, pendingOfflineCount: remaining } : prev));
    if (remaining === 0) toast.success("All offline transactions synced");
    else toast.error(`${remaining} transaction(s) still pending`);
  }, [triggerSync]);

  const lock = useCallback(
    (reason: LockReason = "manual") => {
      setLocked(true);
      setLockReason(reason);
      setLockedAt(Date.now());
      logLockEvent({
        storeId,
        userId: user.id,
        unitNumber: posRef.current?.unitNumber ?? null,
        eventType: "locked",
        reason,
      });
    },
    [storeId, user.id]
  );
  const unlock = useCallback(() => {
    setLocked(false);
    setLockReason(null);
    setLockedAt(null);
    logLockEvent({
      storeId,
      userId: user.id,
      unitNumber: posRef.current?.unitNumber ?? null,
      eventType: "unlocked",
    });
    // The cart is live in memory again; a stale parked copy would otherwise
    // resurrect an already-sold cart on the next page load.
    void clearParkedCart(storeId, user.id).catch(() => {});
  }, [storeId, user.id]);

  const parkAndLock = useCallback(async () => {
    const snapshot = posRef.current;
    if (!snapshot) return;
    try {
      await parkCart(storeId, user.id, snapshot.cart);
    } catch {
      toast.error("Could not park the cart — it was not saved.");
      return;
    }
    setDialogOpen(false);
    setLocked(true);
    setLockReason("manual");
    setLockedAt(Date.now());
    logLockEvent({
      storeId,
      userId: user.id,
      unitNumber: snapshot.unitNumber,
      eventType: "cart_parked",
    });
    toast.success("Cart parked. Terminal locked.");
  }, [storeId, user.id]);

  useEffect(() => {
    const unsubscribe = listenForForceLogout(() => {
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = "/login";
    });
    // Back/forward cache can resurrect a signed-in page from memory without
    // a server round-trip; reload so the proxy gets to redirect to /login.
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) window.location.reload();
    };
    window.addEventListener("pageshow", onPageShow);
    return () => {
      unsubscribe();
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const ctrlShiftQ = event.ctrlKey && event.shiftKey && event.code === "KeyQ";
      const altL = event.altKey && !event.ctrlKey && !event.shiftKey && event.code === "KeyL";
      if (ctrlShiftQ || altL) {
        event.preventDefault();
        void requestSignOut();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [requestSignOut]);

  const value = useMemo<SessionGuardValue>(
    () => ({
      user,
      unitNumber: pos?.unitNumber ?? null,
      locked,
      lockReason,
      lockedAt,
      lock,
      unlock,
      requestSignOut,
      signOutNow: teardown,
      registerPos,
    }),
    [
      user,
      pos?.unitNumber,
      locked,
      lockReason,
      lockedAt,
      lock,
      unlock,
      requestSignOut,
      teardown,
      registerPos,
    ]
  );

  return (
    <SessionGuardContext.Provider value={value}>
      {children}
      <LogoutConfirmDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        checks={checks}
        user={user}
        storeName={pos?.unitNumber ? `${storeName} · Unit ${pos.unitNumber}` : storeName}
        returnFocusRef={returnFocusRef}
        onConfirm={teardown}
        onPark={parkAndLock}
        onSyncNow={syncNow}
      />
      {locked && (
        <LockOverlay
          onUnlock={unlock}
          onSignOut={teardown}
          storeId={storeId}
          userId={user.id}
          unitNumber={pos?.unitNumber ?? null}
          reason={lockReason ?? "manual"}
        />
      )}
    </SessionGuardContext.Provider>
  );
}
