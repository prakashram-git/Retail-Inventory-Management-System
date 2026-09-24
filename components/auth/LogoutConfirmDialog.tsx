"use client";

import { useEffect, useRef, useState } from "react";
import { Info, Loader2, LogOut, ParkingSquare, RefreshCw, ShieldAlert, TriangleAlert } from "lucide-react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useStore } from "@/components/providers/StoreProvider";
import { ROLE_LABEL } from "@/components/layout/UserMenu";
import type { SessionUser } from "./SessionProvider";

export interface SignOutChecks {
  /** Condition B: units in the active POS cart, and their grand total. */
  cartItemCount: number;
  cartTotal: number;
  canPark: boolean;
  /** Condition C: an open cash_drawer_sessions row for this cashier. */
  drawerOpen: boolean;
  /** Condition A: offline_orders_queue rows not yet on the server. */
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
  onSyncNow: () => Promise<void>;
}

/** 44px minimum everywhere, 48px on phones/tablets. */
const BTN = "touch-target touch-manipulation max-md:min-h-12!";

export function LogoutConfirmDialog({
  open,
  onOpenChange,
  checks,
  user,
  storeName,
  returnFocusRef,
  onConfirm,
  onPark,
  onSyncNow,
}: LogoutConfirmDialogProps) {
  const { formatPrice } = useStore();
  const [busy, setBusy] = useState<"signout" | "park" | "sync" | null>(null);
  const [override, setOverride] = useState(false);
  const stayRef = useRef<HTMLButtonElement | null>(null);

  // The override must be re-acknowledged every time the dialog opens.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (open) setOverride(false);
  }, [open]);

  async function run(kind: "signout" | "park" | "sync", action: () => Promise<void>) {
    setBusy(kind);
    try {
      await action();
    } finally {
      // A successful sign-out navigates away; only a failure lands here with the dialog still up.
      setBusy(null);
    }
  }

  const pending = checks?.pendingOfflineCount ?? 0;
  const hasCart = (checks?.cartItemCount ?? 0) > 0;
  const signOutBlocked = pending > 0 && !override;

  return (
    <AlertDialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <AlertDialogContent
        initialFocus={stayRef}
        finalFocus={returnFocusRef}
        data-testid="logout-dialog"
        className="gap-3 p-4 sm:max-w-sm"
      >
        <AlertDialogHeader className="gap-0.5">
          <AlertDialogTitle>Confirm Sign Out</AlertDialogTitle>
          <AlertDialogDescription className="text-xs">
            <span className="font-medium text-foreground">{user.fullName ?? user.email}</span>
            <span data-testid="logout-role-badge"> · {ROLE_LABEL[user.role]}</span>
            <span data-testid="logout-store-badge"> · {storeName}</span>
            <br />
            {user.email}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {checks && (pending > 0 || hasCart || checks.drawerOpen) && (
          <div className="flex flex-col gap-1.5 text-xs">
            {pending > 0 && (
              <div
                role="alert"
                data-testid="logout-warning-queue"
                className="flex flex-col gap-1.5 rounded-md border border-red-500/40 bg-red-500/10 p-2 text-red-700 dark:text-red-300"
              >
                <p className="flex items-start gap-1.5">
                  <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
                  <span>
                    <strong>CRITICAL:</strong> You have {pending} pending offline transactions waiting to sync to
                    the server.
                  </span>
                </p>
                <label className="flex cursor-pointer items-start gap-2 text-foreground">
                  <Checkbox
                    checked={override}
                    onCheckedChange={(v) => setOverride(v === true)}
                    disabled={!!busy}
                    data-testid="logout-override"
                    aria-label="Acknowledge unsynced transactions"
                    className="mt-0.5"
                  />
                  I understand unsynced transactions may be delayed or stranded on this terminal.
                </label>
                <Button
                  size="sm"
                  variant="ghost"
                  className={`${BTN} h-7 self-start px-2 text-xs text-red-700 hover:bg-red-500/15 dark:text-red-300`}
                  disabled={!!busy}
                  data-testid="sync-now-btn"
                  onClick={() => run("sync", onSyncNow)}
                >
                  {busy === "sync" ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                  Sync Now
                </Button>
              </div>
            )}
            {hasCart && (
              <p
                role="alert"
                data-testid="logout-warning-cart"
                className="flex items-start gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-amber-800 dark:text-amber-300"
              >
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                Active cart contains {checks.cartItemCount} item(s) totaling {formatPrice(checks.cartTotal)}.
              </p>
            )}
            {checks.drawerOpen && (
              <p
                role="status"
                data-testid="logout-warning-drawer"
                className="flex items-start gap-1.5 rounded-md border border-sky-500/40 bg-sky-500/10 p-2 text-sky-800 dark:text-sky-300"
              >
                <Info className="mt-0.5 size-3.5 shrink-0" />
                Notice: Cash drawer shift is still OPEN. You must reconcile your blind count and print a Z-Report
                upon return.
              </p>
            )}
          </div>
        )}

        <AlertDialogFooter className="grid grid-cols-2 gap-2 sm:flex-none">
          <Button
            ref={stayRef}
            autoFocus
            variant="outline"
            className={`${BTN} border-slate-300 ${checks?.canPark ? "col-span-2" : ""}`}
            disabled={!!busy}
            onClick={() => onOpenChange(false)}
          >
            Stay Signed In
          </Button>
          {checks?.canPark && (
            <Button
              variant="secondary"
              className={BTN}
              disabled={!!busy}
              data-testid="park-cart-btn"
              onClick={() => run("park", onPark)}
            >
              {busy === "park" ? <Loader2 className="animate-spin" /> : <ParkingSquare />}
              Park Cart &amp; Lock
            </Button>
          )}
          <Button
            variant="destructive"
            className={BTN}
            disabled={!!busy || signOutBlocked}
            data-testid="confirm-signout-btn"
            onClick={() => run("signout", onConfirm)}
          >
            {busy === "signout" ? <Loader2 className="animate-spin" /> : <LogOut />}
            {hasCart || pending > 0 ? "Discard & Sign Out" : "Sign Out"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
