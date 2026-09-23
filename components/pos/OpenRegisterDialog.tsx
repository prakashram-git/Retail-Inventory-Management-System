"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { openSession, type CashDrawerSession } from "@/lib/pos/session";
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
  onOpened: (session: CashDrawerSession) => void;
}

export function OpenRegisterDialog({ storeId, cashierId, onOpened }: OpenRegisterDialogProps) {
  const [openingFloat, setOpeningFloat] = useState("0");
  const [isPending, startTransition] = useTransition();

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

  return (
    <Dialog open>
      <DialogContent showCloseButton={false} className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Open your register</DialogTitle>
          <DialogDescription>
            Count your starting cash before taking any sales this shift.
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
            disabled={isPending}
            autoFocus
            className="font-mono"
          />
        </div>

        <DialogFooter>
          <Button onClick={submit} disabled={isPending} className="w-full">
            {isPending ? "Opening..." : "Open register"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
