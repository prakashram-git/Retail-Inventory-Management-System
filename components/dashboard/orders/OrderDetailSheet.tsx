"use client";

import { useState } from "react";
import { Undo2, ShieldCheck } from "lucide-react";
import { useStore } from "@/components/providers/StoreProvider";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ReturnModal } from "./ReturnModal";
import type { OrderRow } from "@/lib/orders/types";

/** Never renders a full card number — only the scheme + last 4 the schema stores. */
function maskedPaymentSummary(order: OrderRow): string {
  if (order.payment_method === "card") {
    const brand = order.card_brand ?? "Card";
    const last4 = order.card_last_four ?? "????";
    return `${brand} •••• •••• •••• ${last4}`;
  }
  if (order.payment_method === "qr_transfer") {
    return "Mall QR transfer";
  }
  return "Cash";
}

/** Shortens a SHA-256 hex digest to a legible chip; the full value is in the title attribute. */
function shortHash(hash: string | null): string {
  if (!hash) return "—";
  return `${hash.slice(0, 10)}…${hash.slice(-6)}`;
}

interface OrderDetailSheetProps {
  order: OrderRow | null;
  onOpenChange: (open: boolean) => void;
  currentUserId: string;
}

export function OrderDetailSheet({ order, onOpenChange, currentUserId }: OrderDetailSheetProps) {
  const { formatPrice } = useStore();
  const [returnModalOpen, setReturnModalOpen] = useState(false);

  if (!order) return null;

  const hasRefundableItems = order.order_items.some(
    (item) => item.quantity > item.refunded_quantity
  );
  const canReturn = order.status !== "voided" && order.status !== "refunded" && hasRefundableItems;

  return (
    <>
      <Sheet open={!!order} onOpenChange={onOpenChange}>
        <SheetContent className="flex w-full flex-col overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Invoice {order.invoice_number}</SheetTitle>
            <SheetDescription>
              {new Date(order.created_at).toLocaleString()} ·{" "}
              {order.cashier?.full_name ?? order.cashier?.email ?? "Unknown cashier"}
            </SheetDescription>
          </SheetHeader>

          <div className="flex flex-col gap-3 px-4">
            <ul className="flex flex-col gap-2">
              {order.order_items.map((item) => {
                return (
                  <li key={item.id} className="flex items-start justify-between gap-2 text-sm">
                    <div className="flex flex-col">
                      <span className="font-medium">{item.product?.name ?? "Unknown item"}</span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {item.product?.sku} · {item.quantity} x {formatPrice(item.unit_price)}
                        {item.refunded_quantity > 0 && (
                          <> · {item.refunded_quantity} refunded</>
                        )}
                      </span>
                    </div>
                    <span className="font-mono">{formatPrice(item.subtotal)}</span>
                  </li>
                );
              })}
            </ul>

            <div className="flex flex-col gap-1 rounded-lg border px-3 py-2 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span className="font-mono">{formatPrice(order.subtotal)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Tax</span>
                <span className="font-mono">{formatPrice(order.tax)}</span>
              </div>
              {order.discount > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Discount</span>
                  <span className="font-mono">-{formatPrice(order.discount)}</span>
                </div>
              )}
              <div className="flex justify-between font-semibold">
                <span>Total</span>
                <span className="font-mono">{formatPrice(order.total)}</span>
              </div>
            </div>

            <div className="flex flex-col gap-1 rounded-lg border px-3 py-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Payment</span>
                <span className="font-mono">{maskedPaymentSummary(order)}</span>
              </div>
              {order.payment_method === "card" && order.payment_auth_code && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Auth code</span>
                  <span className="font-mono">{order.payment_auth_code}</span>
                </div>
              )}
              {order.payment_method === "cash" && order.amount_tendered != null && (
                <>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tendered</span>
                    <span className="font-mono">{formatPrice(order.amount_tendered)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Change</span>
                    <span className="font-mono">{formatPrice(order.change_due)}</span>
                  </div>
                </>
              )}
            </div>

            <div className="flex flex-col gap-1.5 rounded-lg border px-3 py-2 text-sm">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <ShieldCheck className="size-3.5" />
                Fiscal audit chain
                {order.is_offline_sync && <Badge variant="outline">Synced offline</Badge>}
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Previous hash</span>
                <span className="truncate font-mono" title={order.previous_order_hash ?? undefined}>
                  {shortHash(order.previous_order_hash)}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Current hash</span>
                <span className="truncate font-mono" title={order.current_order_hash}>
                  {shortHash(order.current_order_hash)}
                </span>
              </div>
            </div>
          </div>

          <SheetFooter>
            {canReturn && (
              <Button className="w-full" variant="outline" onClick={() => setReturnModalOpen(true)}>
                <Undo2 />
                Process return
              </Button>
            )}
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <ReturnModal
        open={returnModalOpen}
        onOpenChange={setReturnModalOpen}
        order={order}
        currentUserId={currentUserId}
      />
    </>
  );
}
