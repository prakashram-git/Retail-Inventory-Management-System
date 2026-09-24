"use client";

import { useCallback, useEffect, useRef } from "react";
import { useSessionGuard } from "@/components/auth/SessionProvider";

const INACTIVITY_MS = 120_000;
const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "touchstart", "wheel"] as const;

/**
 * Inactivity watcher only: after INACTIVITY_MS without input it asks the
 * session guard to lock. The lock screen itself lives in SessionProvider
 * (components/auth/LockOverlay.tsx) so the header menu can trigger the same
 * lock from any view without touching the cart.
 */
export function TerminalLock() {
  const { lock } = useSessionGuard();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(lock, INACTIVITY_MS);
  }, [lock]);

  useEffect(() => {
    resetTimer();
    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, resetTimer, { passive: true });
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, resetTimer);
      }
    };
  }, [resetTimer]);

  return null;
}
