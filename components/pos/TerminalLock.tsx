"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Lock } from "lucide-react";
import { toast } from "sonner";
import { verifyPosPin } from "@/lib/actions/pos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const INACTIVITY_MS = 120_000;
const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "touchstart", "wheel"] as const;

/**
 * Renders on top of the whole terminal (not gated on cart state, so it
 * never unmounts and never touches the cart) and locks purely with a
 * full-screen, pointer-capturing overlay — resuming just hides it, leaving
 * whatever was in progress underneath untouched.
 */
export function TerminalLock() {
  const [locked, setLocked] = useState(false);
  const [pin, setPin] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setLocked(true), INACTIVITY_MS);
  }, []);

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

  async function submit() {
    if (!pin) return;
    setIsVerifying(true);
    try {
      const ok = await verifyPosPin(pin);
      if (ok) {
        setLocked(false);
        setPin("");
        resetTimer();
      } else {
        toast.error("Incorrect PIN");
        setPin("");
      }
    } catch {
      toast.error("Could not verify PIN — try again");
      setPin("");
    } finally {
      setIsVerifying(false);
    }
  }

  if (!locked) return null;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-4 bg-background/80 backdrop-blur-xl">
      <div className="flex flex-col items-center gap-2 text-center">
        <Lock className="size-8 text-muted-foreground" />
        <p className="text-lg font-semibold">Terminal locked</p>
        <p className="text-sm text-muted-foreground">
          Enter your PIN to resume — your cart is still here.
        </p>
      </div>

      <div className="flex w-full max-w-[240px] flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="terminal-lock-pin" className="sr-only">
            PIN
          </Label>
          <Input
            id="terminal-lock-pin"
            type="password"
            inputMode="numeric"
            autoFocus
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            disabled={isVerifying}
            className="touch-target text-center font-mono text-lg tracking-widest"
            placeholder="••••"
          />
        </div>
        <Button onClick={submit} disabled={isVerifying || !pin} className="touch-target">
          {isVerifying ? "Verifying..." : "Unlock"}
        </Button>
      </div>
    </div>
  );
}
