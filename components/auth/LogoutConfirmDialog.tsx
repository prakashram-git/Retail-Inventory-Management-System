"use client";

import { useRef, useState } from "react";
import { Loader2, LogOut, ParkingSquare, TriangleAlert, Info, ShieldAlert } from "lucide-react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { SessionUser } from "./SessionProvider";

export interface SignOutChecks {
  /** Condition A: units in the active POS cart. */
  cartItemCount: number;
  canPark: boolean;
  /** Condition B: an open cash_drawer_sessions row for this cashier. */
  drawerOpen: boolean;
  /** Condition C: offline_orders_queue rows not yet on the server. */
  pendingOfflineCount: number;
}

interface LogoutConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  checks: SignOutChecks | null;
  user: SessionUser;
  storeName: string;
  returnFocusRef: React.RefObject<HTMLElement | null>;
  onConfirm: () => Promise<void>;
  onPark: () => Promise<void>;
}

export function LogoutConfirmDialog({
  open,
  onOpenChange,
  checks,
  user,
  storeName,
  returnFocusRef,
  onConfirm,
  onPark,
}: LogoutConfirmDialogProps) {
  const [busy, setBusy] = useState<"signout" | "park" | null>(null);
  const stayRef = useRef<HTMLButtonElement | null>(null);

  async function run(kind: "signout" | "park", action: () => Promise<void>) {
    setBusy(kind);
    try {
      await action();
    } finally {
      // A successful sign-out navigates away; only a failure lands here with the dialog still up.
      setBusy(null);
    }
  }

  const hasCart = (checks?.cartItemCount ?? 0) > 0;

  return (
    <AlertDialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <AlertDialogContent initialFocus={stayRef} finalFocus={returnFocusRef} data-testid="logout-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>Confirm Sign Out</AlertDialogTitle>
          <AlertDialogDescription>
            Signed in as {user.fullName ?? user.email} ({user.email}) - {storeName}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {checks && (
          <div className="flex flex-col gap-2">
            {checks.pendingOfflineCount > 0 && (
              <div role="alert" data-testid="logout-warning-queue" className="flex gap-2 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-red-700 dark:text-red-300">
                <ShieldAlert className="mt-0.5 size-4 shrink-0" />
                <p className="text-sm">
                  <strong>CRITICAL:</strong> You have {checks.pendingOfflineCount} pending offline
                  transactions waiting to sync. Signing out before reconnecting will delay server
                  recording.
                </p>
              </div>
            )}
            {hasCart && (
              <div role="alert" data-testid="logout-warning-cart" className="flex gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-amber-800 dark:text-amber-300">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                <p className="text-sm">You have {checks.cartItemCount} item(s) in your active cart.</p>
              </div>
            )}
            {checks.drawerOpen && (
              <div role="status" data-testid="logout-warning-drawer" className="flex gap-2 rounded-lg border border-sky-500/40 bg-sky-500/10 p-3 text-sky-800 dark:text-sky-300">
                <Info className="mt-0.5 size-4 shrink-0" />
                <p className="text-sm">
                  Notice: Cash drawer session is currently OPEN. Closing float reconciliation will
                  be required upon next sign-in.
                </p>
              </div>
            )}
          </div>
        )}

        <AlertDialogFooter className="sm:flex-wrap">
          <Button
            ref={stayRef}
            variant="outline"
            className="touch-target border-slate-300"
            disabled={!!busy}
            onClick={() => onOpenChange(false)}
          >
            Stay Signed In
          </Button>
          {checks?.canPark && (
            <Button
              variant="secondary"
              className="touch-target"
              disabled={!!busy}
              data-testid="park-cart-btn"
              onClick={() => run("park", onPark)}
            >
              {busy === "park" ? <Loader2 className="animate-spin" /> : <ParkingSquare />}
              Park Cart &amp; Lock Terminal
            </Button>
          )}
          <Button
            variant="destructive"
            className="touch-target"
            disabled={!!busy}
            data-testid="confirm-signout-btn"
            onClick={() => run("signout", onConfirm)}
          >
            {busy === "signout" ? <Loader2 className="animate-spin" /> : <LogOut />}
            {hasCart ? "Discard Cart & Sign Out" : "Sign Out"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
