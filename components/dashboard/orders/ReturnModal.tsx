"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Minus, Plus, Printer, CheckCircle2 } from "lucide-react";
import { useStore } from "@/components/providers/StoreProvider";
import { submitRefund } from "@/lib/orders/refund";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import type { OrderRow } from "@/lib/orders/types";

interface ReturnModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: OrderRow;
  currentUserId: string;
}

export function ReturnModal({ open, onOpenChange, order, currentUserId }: ReturnModalProps) {
  const router = useRouter();
  const { formatPrice, storeName } = useStore();
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [reason, setReason] = useState("");
  const [isPending, startTransition] = useTransition();
  const [completed, setCompleted] = useState<{
    lines: { name: string; sku: string; quantity: number; unitPrice: number }[];
    refundSubtotal: number;
    refundTax: number;
    refundTotal: number;
  } | null>(null);

  useEffect(() => {
    if (!open) return;
    // Resets the form each time the modal opens for a (possibly different) order.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setQuantities({});
    setReason("");
    setCompleted(null);
  }, [open]);

  const returnableLines = order.order_items.filter((item) => item.quantity > item.refunded_quantity);

  function setQuantity(itemId: string, remaining: number, next: number) {
    setQuantities((prev) => ({ ...prev, [itemId]: Math.max(0, Math.min(remaining, next)) }));
  }

  /** Checking a line defaults it to its full eligible quantity; unchecking zeroes it out. */
  function toggleLine(itemId: string, remaining: number, checked: boolean) {
    setQuantities((prev) => ({ ...prev, [itemId]: checked ? remaining : 0 }));
  }

  const taxRate = order.subtotal > 0 ? order.tax / order.subtotal : 0;
  const refundSubtotal = returnableLines.reduce(
    (sum, item) => sum + (quantities[item.id] ?? 0) * item.unit_price,
    0
  );
  const refundTax = refundSubtotal * taxRate;
  const refundTotal = refundSubtotal + refundTax;
  const hasSelection = refundSubtotal > 0;

  function submit() {
    const items = returnableLines
      .map((item) => ({ orderItemId: item.id, quantity: quantities[item.id] ?? 0 }))
      .filter((line) => line.quantity > 0);

    startTransition(async () => {
      try {
        await submitRefund({
          orderId: order.id,
          cashierId: currentUserId,
          items,
          reason: reason.trim() || null,
        });

        setCompleted({
          lines: items.map((line) => {
            const source = returnableLines.find((item) => item.id === line.orderItemId)!;
            return {
              name: source.product?.name ?? "Unknown item",
              sku: source.product?.sku ?? "",
              quantity: line.quantity,
              unitPrice: source.unit_price,
            };
          }),
          refundSubtotal,
          refundTax,
          refundTotal,
        });
        toast.success("Return processed");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Return failed");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !isPending && onOpenChange(next)}>
      <DialogContent className="flex max-h-[85vh] flex-col overflow-y-auto sm:max-w-md">
        {!completed ? (
          <>
            <DialogHeader>
              <DialogTitle>Return items</DialogTitle>
              <DialogDescription>
                Select the quantity of each item being returned from invoice{" "}
                {order.invoice_number}.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-3">
              <ul className="flex flex-col gap-2">
                {returnableLines.map((item) => {
                  const remaining = item.quantity - item.refunded_quantity;
                  const qty = quantities[item.id] ?? 0;
                  const checked = qty > 0;
                  return (
                    <li key={item.id} className="flex items-center justify-between gap-2 text-sm">
                      <div className="flex items-start gap-2">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(next) => toggleLine(item.id, remaining, !!next)}
                          disabled={isPending}
                          className="mt-0.5"
                        />
                        <div className="flex flex-col">
                          <span className="font-medium">{item.product?.name ?? "Unknown item"}</span>
                          <span className="text-xs text-muted-foreground">
                            {formatPrice(item.unit_price)} each · {item.quantity} purchased
                            {item.refunded_quantity > 0 && ` · ${item.refunded_quantity} already returned`}
                            {" · "}
                            {remaining} eligible
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="icon-xs"
                          onClick={() => setQuantity(item.id, remaining, qty - 1)}
                          disabled={isPending || qty <= 0}
                        >
                          <Minus />
                        </Button>
                        <span className="w-6 text-center font-mono text-sm tabular-nums">{qty}</span>
                        <Button
                          variant="outline"
                          size="icon-xs"
                          onClick={() => setQuantity(item.id, remaining, qty + 1)}
                          disabled={isPending || qty >= remaining}
                        >
                          <Plus />
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="return-reason">Reason (optional)</Label>
                <Textarea
                  id="return-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  disabled={isPending}
                  placeholder="Damaged, wrong size, changed mind..."
                />
              </div>

              <div className="flex justify-between rounded-lg bg-muted px-3 py-2 text-sm font-semibold">
                <span>Refund total</span>
                <span className="font-mono">{formatPrice(refundTotal)}</span>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={isPending || !hasSelection}>
                {isPending ? "Processing..." : `Refund ${formatPrice(refundTotal)}`}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="size-5 text-emerald-600" />
                Return complete
              </DialogTitle>
              <DialogDescription>Credit slip below can be printed for the customer.</DialogDescription>
            </DialogHeader>

            <div
              id="receipt-print-area"
              className="mx-auto w-full max-w-[300px] rounded-lg border bg-card p-4 font-mono text-xs"
            >
              <div className="text-center">
                <p className="text-sm font-bold uppercase">{storeName}</p>
                <p>RETURN CREDIT SLIP</p>
                <p>{new Date().toLocaleString()}</p>
                <p>Original invoice: {order.invoice_number}</p>
              </div>

              <div className="my-2 border-t border-dashed" />

              {completed.lines.map((line, index) => (
                <div key={`${line.sku}-${index}`} className="flex justify-between gap-2 py-0.5">
                  <div>
                    <p>{line.name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {line.quantity} x {formatPrice(line.unitPrice)}
                    </p>
                  </div>
                  <p className="shrink-0">{formatPrice(line.quantity * line.unitPrice)}</p>
                </div>
              ))}

              <div className="my-2 border-t border-dashed" />

              <div className="flex justify-between">
                <span>Subtotal refunded</span>
                <span>{formatPrice(completed.refundSubtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span>Tax refunded</span>
                <span>{formatPrice(completed.refundTax)}</span>
              </div>
              <div className="flex justify-between font-bold">
                <span>Total credit</span>
                <span>{formatPrice(completed.refundTotal)}</span>
              </div>

              <div className="my-2 border-t border-dashed" />
              <p className="text-center">Keep this slip as proof of return.</p>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => window.print()}>
                <Printer />
                Print credit slip
              </Button>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
