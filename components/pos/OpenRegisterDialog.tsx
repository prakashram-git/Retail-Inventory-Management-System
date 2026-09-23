"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { LogOut } from "lucide-react";
import { openSession, type CashDrawerSession } from "@/lib/pos/session";
import { logout } from "@/lib/actions/auth";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface OpenRegisterDialogProps {
  storeId: string;
  cashierId: string;
  /** Shown after closing a shift, when a fresh log-in isn't what's happening
   * — softens the copy from "start of shift" to "what's next". */
  justClosedShift?: boolean;
  onOpened: (session: CashDrawerSession) => void;
}

export function OpenRegisterDialog({
  storeId,
  cashierId,
  justClosedShift = false,
  onOpened,
}: OpenRegisterDialogProps) {
  const [openingFloat, setOpeningFloat] = useState("0");
  const [isPending, startTransition] = useTransition();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  function submit() {
    startTransition(async () => {
      try {
        const session = await openSession(storeId, cashierId, Number(openingFloat) || 0);
        toast.success("Register opened");
        onOpened(session);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not open the register");
      }
    });
  }

  async function handleLogout() {
    setIsLoggingOut(true);
    await logout();
  }

  return (
    <Dialog open>
      <DialogContent showCloseButton={false} className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {justClosedShift ? "Start a new shift?" : "Open your register"}
          </DialogTitle>
          <DialogDescription>
            {justClosedShift
              ? "Your shift is closed. Open a new register to keep selling, or log out."
              : "Count your starting cash before taking any sales this shift."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="opening-float">Opening float</Label>
          <Input
            id="opening-float"
            type="number"
            min={0}
            step="0.01"
            value={openingFloat}
            onChange={(e) => setOpeningFloat(e.target.value)}
            disabled={isPending || isLoggingOut}
            autoFocus
            className="font-mono"
          />
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button onClick={submit} disabled={isPending || isLoggingOut} className="w-full">
            {isPending ? "Opening..." : "Open register"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={handleLogout}
            disabled={isPending || isLoggingOut}
            className="w-full"
          >
            <LogOut />
            {isLoggingOut ? "Logging out..." : "Log out instead"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
