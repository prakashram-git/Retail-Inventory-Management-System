"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { getPendingSyncCount, replayOfflineQueue } from "@/lib/offline/sync";

interface SyncContextValue {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  triggerSync: () => Promise<void>;
}

const SyncContext = createContext<SyncContextValue | null>(null);

export function useSync() {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error("useSync must be used within a SyncProvider");
  return ctx;
}

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const [isOnline, setIsOnline] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const wasOffline = useRef(false);

  const refreshPendingCount = useCallback(async () => {
    setPendingCount(await getPendingSyncCount());
  }, []);

  const triggerSync = useCallback(async () => {
    if (!navigator.onLine || isSyncing) return;
    await refreshPendingCount();
    setIsSyncing(true);
    try {
      await replayOfflineQueue();
    } finally {
      await refreshPendingCount();
      setIsSyncing(false);
    }
  }, [isSyncing, refreshPendingCount]);

  useEffect(() => {
    // navigator.onLine is unavailable during SSR, so the real value can only
    // be read here, after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsOnline(navigator.onLine);
    wasOffline.current = !navigator.onLine;

    // Orders can be queued in a previous session (app closed while offline)
    // and the app can then be reopened already online — that queue also
    // needs a flush, not just the offline->online transition mid-session.
    if (navigator.onLine) {
      triggerSync();
    } else {
      refreshPendingCount();
    }

    function handleOnline() {
      setIsOnline(true);
      if (wasOffline.current) {
        wasOffline.current = false;
        triggerSync();
      }
    }

    function handleOffline() {
      wasOffline.current = true;
      setIsOnline(false);
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the badge count fresh while offline orders are still being queued.
  useEffect(() => {
    if (isOnline) return;
    const interval = setInterval(refreshPendingCount, 3000);
    return () => clearInterval(interval);
  }, [isOnline, refreshPendingCount]);

  return (
    <SyncContext.Provider value={{ isOnline, isSyncing, pendingCount, triggerSync }}>
      {children}
      {!isOnline && (
        <div
          role="status"
          className="fixed inset-x-0 bottom-0 z-50 flex items-center justify-center gap-2 border-t border-amber-300 bg-amber-50 px-4 py-2 text-center text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
        >
          <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-amber-500" />
          Offline Mode Active. Transactions are saving to local IndexedDB and
          will auto-sync upon reconnection.
        </div>
      )}
      {isOnline && isSyncing && (
        <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm text-primary-foreground shadow-lg">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-primary-foreground" />
          Syncing {pendingCount} offline transactions...
        </div>
      )}
    </SyncContext.Provider>
  );
}
