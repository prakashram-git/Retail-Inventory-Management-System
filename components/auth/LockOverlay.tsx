"use client";

import { useEffect, useRef, useState } from "react";
import { Lock, LogOut } from "lucide-react";
import { toast } from "sonner";
import { verifyPosPin } from "@/lib/actions/pos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getLockoutState, recordFailedAttempt, clearAttempts } from "@/lib/pos/pin-lockout";
import { logLockEvent } from "@/lib/pos/lockAudit";
import type { LockReason } from "./SessionProvider";

const LOCK_COPY: Record<LockReason, { title: string; subtitle: string }> = {
  inactivity: {
    title: "Terminal locked",
    subtitle: "Enter your PIN to resume — your cart is still here.",
  },
  order_completed: {
    title: "Sale complete",
    subtitle: "Enter your PIN to continue serving customers.",
  },
  drawer_closed: {
    title: "Shift closed",
    subtitle: "Enter your PIN to continue — you can start a new shift or sign out.",
  },
  manual: {
    title: "Terminal locked",
    subtitle: "Enter your PIN to resume.",
  },
};

function formatRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

interface LockOverlayProps {
  onUnlock: () => void;
  onSignOut: () => Promise<void>;
  storeId: string;
  userId: string;
  unitNumber: string | null;
  reason: LockReason;
}

/**
 * Frosted full-screen lock. It only covers the UI — nothing underneath
 * (cart, register session, offline queue) is touched, so unlocking resumes
 * exactly where the cashier left off.
 *
 * Brute-force protection is enforced fully offline via Dexie
 * (lib/pos/pin-lockout.ts): a progressive delay for the first few wrong
 * PINs, then a hard 30-minute lockout after 6 — matching PCI DSS v4.0 8.2.4.
 */
export function LockOverlay({ onUnlock, onSignOut, storeId, userId, unitNumber, reason }: LockOverlayProps) {
  const { title, subtitle } = LOCK_COPY[reason];
  const [secret, setSecret] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [lockedUntilMs, setLockedUntilMs] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const pendingDelayRef = useRef(0);

  useEffect(() => {
    getLockoutState(storeId, userId).then((state) => {
      setLockedUntilMs(state.lockedOut ? state.lockedUntilMs : null);
      pendingDelayRef.current = state.nextAttemptDelayMs;
    });
  }, [storeId, userId]);

  useEffect(() => {
    if (!lockedUntilMs) return;
    const interval = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [lockedUntilMs]);

  const isLockedOut = lockedUntilMs !== null && lockedUntilMs > nowMs;

  async function submit() {
    if (!secret || isLockedOut) return;
    if (pendingDelayRef.current > 0) {
      await new Promise((resolve) => setTimeout(resolve, pendingDelayRef.current));
    }

    setIsVerifying(true);
    try {
      if (await verifyPosPin(secret)) {
        setSecret("");
        await clearAttempts(storeId, userId);
        onUnlock();
      } else {
        setSecret("");
        const state = await recordFailedAttempt(storeId, userId);
        pendingDelayRef.current = state.nextAttemptDelayMs;
        if (state.lockedOut) {
          setLockedUntilMs(state.lockedUntilMs);
          logLockEvent({
            storeId,
            userId,
            unitNumber,
            eventType: "unlock_locked_out",
            reason: `${state.failedCount} failed attempts`,
          });
          toast.error("Too many failed attempts — locked for 30 minutes. Contact a manager.");
        } else {
          logLockEvent({
            storeId,
            userId,
            unitNumber,
            eventType: "unlock_failed",
            reason: `attempt ${state.failedCount}`,
          });
          toast.error("Incorrect PIN");
        }
      }
    } catch {
      toast.error("Could not verify PIN — try again");
      setSecret("");
    } finally {
      setIsVerifying(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Terminal locked"
      data-testid="terminal-lock"
      className="fixed inset-0 z-[80] flex flex-col items-center justify-center gap-4 bg-background/80 backdrop-blur-xl"
    >
      <div className="flex flex-col items-center gap-2 text-center">
        <Lock className="size-8 text-muted-foreground" />
        <p className="text-lg font-semibold">{title}</p>
        <p className="text-sm text-muted-foreground">
          {isLockedOut ? "Too many failed attempts." : subtitle}
        </p>
      </div>

      {isLockedOut ? (
        <div className="flex w-full max-w-[260px] flex-col gap-3 text-center">
          <p className="font-mono text-2xl tabular-nums">{formatRemaining(lockedUntilMs! - nowMs)}</p>
          <p className="text-xs text-muted-foreground">A manager can sign in to unlock immediately.</p>
          <Button variant="ghost" onClick={() => void onSignOut()} className="touch-target text-muted-foreground">
            <LogOut />
            Sign out instead
          </Button>
        </div>
      ) : (
        <div className="flex w-full max-w-[260px] flex-col gap-3">
          <Label htmlFor="terminal-lock-pin" className="sr-only">
            PIN (or account password if you have no PIN)
          </Label>
          <Input
            id="terminal-lock-pin"
            type="password"
            autoFocus
            autoComplete="off"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            disabled={isVerifying}
            className="touch-target text-center font-mono text-lg tracking-widest"
            placeholder="PIN"
          />
          <Button onClick={submit} disabled={isVerifying || !secret} className="touch-target">
            {isVerifying ? "Verifying..." : "Unlock"}
          </Button>
          <Button variant="ghost" onClick={() => void onSignOut()} className="touch-target text-muted-foreground">
            <LogOut />
            Sign out instead
          </Button>
        </div>
      )}
    </div>
  );
}
