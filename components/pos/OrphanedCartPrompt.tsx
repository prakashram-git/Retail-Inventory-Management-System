"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { listParkedCartsForStore, clearParkedCart } from "@/lib/pos/parkedCart";
import { logLockEvent } from "@/lib/pos/lockAudit";
import type { ParkedCart } from "@/lib/offline/db";
import type { CartLine } from "@/lib/pos/types";

interface StaffDirectoryEntry {
  id: string;
  name: string;
}

interface OrphanedCartPromptProps {
  storeId: string;
  unitNumber: string | null;
  currentUserId: string;
  currentUserName: string;
  /** Only rendered for store_manager/super_admin — see PosTerminal. */
  staffDirectory: StaffDirectoryEntry[];
  /** Bumped (e.g. on unlock) to re-check for a cart parked while this device sat locked. */
  refreshKey: number;
  onClaim: (lines: CartLine[]) => void;
}

/**
 * Surfaces another cashier's parked cart left on this same physical unit so a
 * manager/admin unlocking it can claim it (take over the sale), discard it,
 * or simply dismiss and leave it parked for its original owner to resume
 * later (the PRD's "reassign" — no data change needed, since the row already
 * stays associated with that owner until they read or clear it themselves).
 */
export function OrphanedCartPrompt({
  storeId,
  unitNumber,
  currentUserId,
  currentUserName,
  staffDirectory,
  refreshKey,
  onClaim,
}: OrphanedCartPromptProps) {
  const [orphan, setOrphan] = useState<ParkedCart | null>(null);

  useEffect(() => {
    let cancelled = false;
    listParkedCartsForStore(storeId)
      .then((carts) => {
        if (cancelled) return;
        const other = carts.find((c) => c.user_id !== currentUserId);
        setOrphan(other ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [storeId, currentUserId, refreshKey]);

  if (!orphan) return null;

  const ownerName =
    staffDirectory.find((s) => s.id === orphan.user_id)?.name ?? "another cashier";
  const itemCount = orphan.lines.reduce((sum, l) => sum + l.quantity, 0);
  const total = orphan.lines.reduce((sum, l) => sum + l.quantity * l.product.retail_price, 0);

  function dismiss() {
    setOrphan(null);
  }

  async function claim() {
    if (!orphan) return;
    await clearParkedCart(storeId, orphan.user_id);
    onClaim(orphan.lines);
    logLockEvent({
      storeId,
      userId: currentUserId,
      unitNumber,
      eventType: "cart_claimed",
      relatedUserId: orphan.user_id,
      reason: `Claimed by ${currentUserName}`,
    });
    toast.success(`Claimed ${ownerName}'s cart`);
    setOrphan(null);
  }

  async function discard() {
    if (!orphan) return;
    await clearParkedCart(storeId, orphan.user_id);
    logLockEvent({
      storeId,
      userId: currentUserId,
      unitNumber,
      eventType: "cart_discarded",
      relatedUserId: orphan.user_id,
      reason: "manager_clear",
    });
    toast.success(`Discarded ${ownerName}'s parked cart`);
    setOrphan(null);
  }

  return (
    <Dialog open onOpenChange={(open) => !open && dismiss()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Parked cart on this terminal</DialogTitle>
          <DialogDescription>
            {ownerName} left a cart parked here — {itemCount} item{itemCount === 1 ? "" : "s"},
            ${total.toFixed(2)}.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="sm:justify-between">
          <Button variant="destructive" onClick={discard}>
            Discard
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={dismiss}>
              Leave parked
            </Button>
            <Button onClick={claim}>Claim &amp; continue sale</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
