"use client";

import { useState } from "react";
import { Lock, LogOut } from "lucide-react";
import { toast } from "sonner";
import { verifyPosPin } from "@/lib/actions/pos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Frosted full-screen lock. It only covers the UI — nothing underneath
 * (cart, register session, offline queue) is touched, so unlocking resumes
 * exactly where the cashier left off.
 */
export function LockOverlay({ onUnlock, onSignOut }: { onUnlock: () => void; onSignOut: () => Promise<void> }) {
  const [secret, setSecret] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);

  async function submit() {
    if (!secret) return;
    setIsVerifying(true);
    try {
      if (await verifyPosPin(secret)) {
        setSecret("");
        onUnlock();
      } else {
        toast.error("Incorrect PIN");
        setSecret("");
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
        <p className="text-lg font-semibold">Terminal locked</p>
        <p className="text-sm text-muted-foreground">Enter your PIN to resume — your cart is still here.</p>
      </div>

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
    </div>
  );
}
