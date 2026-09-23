"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { ArrowRight } from "lucide-react";
import { adjustStock } from "@/lib/actions/inventory";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ProductWithCategory } from "@/lib/types/domain";

type Reason = "restock" | "shrinkage" | "adjustment";
type Direction = "increase" | "decrease";

const REASON_LABEL: Record<Reason, string> = {
  restock: "Restock (shipment received)",
  shrinkage: "Shrinkage (theft / damage)",
  adjustment: "Manual correction",
};

/** Restock and shrinkage always move stock one direction; only a manual correction lets the manager pick. */
const FIXED_DIRECTION: Partial<Record<Reason, Direction>> = {
  restock: "increase",
  shrinkage: "decrease",
};

interface StockAdjustmentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: ProductWithCategory | null;
}

export function StockAdjustmentModal({ open, onOpenChange, product }: StockAdjustmentModalProps) {
  const [reason, setReason] = useState<Reason>("restock");
  const [direction, setDirection] = useState<Direction>("increase");
  const [quantity, setQuantity] = useState("1");
  const [notes, setNotes] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    // Resets the form each time the modal opens for a (possibly different) product.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReason("restock");
    setDirection("increase");
    setQuantity("1");
    setNotes("");
  }, [open]);

  if (!product) return null;

  const effectiveDirection = FIXED_DIRECTION[reason] ?? direction;
  const parsedQuantity = Math.max(0, Math.trunc(Number(quantity) || 0));
  const delta = effectiveDirection === "increase" ? parsedQuantity : -parsedQuantity;
  const projectedStock = product.current_stock + delta;
  const canSubmit = parsedQuantity > 0 && notes.trim().length > 0 && projectedStock >= 0;

  function submit() {
    startTransition(async () => {
      try {
        await adjustStock({
          product_id: product!.id,
          reason,
          direction: effectiveDirection,
          quantity: parsedQuantity,
          notes,
        });
        toast.success("Stock adjusted");
        onOpenChange(false);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Something went wrong");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !isPending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Adjust stock — {product.name}</DialogTitle>
          <DialogDescription>
            Record a shipment, shrinkage, or manual correction. Every adjustment is logged for audit.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Reason</Label>
            <Select value={reason} onValueChange={(value) => setReason(value as Reason)}>
              <SelectTrigger disabled={isPending}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="restock">{REASON_LABEL.restock}</SelectItem>
                <SelectItem value="shrinkage">{REASON_LABEL.shrinkage}</SelectItem>
                <SelectItem value="adjustment">{REASON_LABEL.adjustment}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {reason === "adjustment" && (
            <div className="flex flex-col gap-1.5">
              <Label>Direction</Label>
              <Select value={direction} onValueChange={(value) => setDirection(value as Direction)}>
                <SelectTrigger disabled={isPending}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="increase">Increase stock</SelectItem>
                  <SelectItem value="decrease">Decrease stock</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="adjustment-quantity">Quantity</Label>
            <Input
              id="adjustment-quantity"
              type="number"
              min={1}
              step="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              disabled={isPending}
              className="font-mono"
              autoFocus
            />
          </div>

          <div className="flex items-center justify-center gap-3 rounded-lg bg-muted px-3 py-2 text-sm">
            <span className="font-mono tabular-nums">{product.current_stock}</span>
            <ArrowRight className="size-4 text-muted-foreground" />
            <span
              className={`font-mono font-semibold tabular-nums ${
                projectedStock < 0 ? "text-destructive" : ""
              }`}
            >
              {projectedStock}
            </span>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="adjustment-notes">Audit notes (required)</Label>
            <Textarea
              id="adjustment-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={isPending}
              placeholder="e.g. PO #4821 received, 3 units damaged in transit"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={isPending || !canSubmit}>
            {isPending ? "Saving..." : "Save adjustment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
