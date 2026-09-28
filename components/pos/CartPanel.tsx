"use client";

import { useState } from "react";
import { Minus, Plus, ShoppingCart, Tag, Trash2, X } from "lucide-react";
import { useStore } from "@/components/providers/StoreProvider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import type { CartTotals } from "@/lib/pos/pricing";
import type { CartLine } from "@/lib/pos/types";

interface CartPanelProps {
  cart: CartLine[];
  totals: CartTotals;
  onIncrement: (productId: string) => void;
  onDecrement: (productId: string) => void;
  onRemove: (productId: string) => void;
  onClear: () => void;
  onCheckout: () => void;
  checkoutDisabled?: boolean;
  /** Store manager / super admin only — matches how "Close Shift" etc. are gated elsewhere in PosTerminal. */
  canApplyDiscount: boolean;
  discount: number;
  onDiscountChange: (value: number) => void;
}

export function CartPanel({
  cart,
  totals,
  onIncrement,
  onDecrement,
  onRemove,
  onClear,
  onCheckout,
  checkoutDisabled,
  canApplyDiscount,
  discount,
  onDiscountChange,
}: CartPanelProps) {
  const { formatPrice } = useStore();
  const [discountInputOpen, setDiscountInputOpen] = useState(false);
  const [discountDraft, setDiscountDraft] = useState("");

  function openDiscountInput() {
    setDiscountDraft(discount > 0 ? String(discount) : "");
    setDiscountInputOpen(true);
  }

  function applyDiscount() {
    const requested = Math.max(0, Number(discountDraft) || 0);
    // Can't discount past a $0 total — matches calculateCartTotals' own floor.
    onDiscountChange(Math.min(requested, totals.subtotal + totals.tax));
    setDiscountInputOpen(false);
  }

  function removeDiscount() {
    onDiscountChange(0);
    setDiscountInputOpen(false);
  }

  return (
    <div className="flex h-full flex-col" data-tour="pos-cart">
      {/* pr-12 reserves room for the mobile Sheet's absolutely-positioned
          close (X) button (MobileCartBar renders this panel inside one),
          which otherwise overlaps "Clear" in the same top-right corner. */}
      <div className="flex items-center justify-between border-b py-3 pl-4 pr-12">
        <h2 className="flex items-center gap-2 font-semibold">
          <ShoppingCart className="size-4" />
          Cart
          {totals.itemCount > 0 && <Badge variant="secondary">{totals.itemCount}</Badge>}
        </h2>
        {cart.length > 0 && (
          <Button variant="ghost" size="sm" onClick={onClear}>
            <Trash2 />
            Clear
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-2">
        {cart.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 py-12 text-center text-muted-foreground">
            <ShoppingCart className="size-8" />
            <p className="text-sm">Scan a barcode or tap a product to start a sale.</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {cart.map((line) => (
              <li key={line.product.id} className="flex items-start gap-2">
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">{line.product.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {formatPrice(line.product.retail_price)} each
                  </span>
                </div>

                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon-xs"
                    onClick={() => onDecrement(line.product.id)}
                  >
                    <Minus />
                  </Button>
                  <span className="w-6 text-center font-mono text-sm tabular-nums">
                    {line.quantity}
                  </span>
                  <Button
                    variant="outline"
                    size="icon-xs"
                    onClick={() => onIncrement(line.product.id)}
                    disabled={line.quantity >= line.product.current_stock}
                  >
                    <Plus />
                  </Button>
                </div>

                <span className="w-16 shrink-0 text-right font-mono text-sm">
                  {formatPrice(line.product.retail_price * line.quantity)}
                </span>

                <button
                  type="button"
                  onClick={() => onRemove(line.product.id)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <X className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-1.5 border-t px-4 py-3 text-sm">
        <div className="flex justify-between text-muted-foreground">
          <span>Subtotal</span>
          <span className="font-mono">{formatPrice(totals.subtotal)}</span>
        </div>
        <div className="flex justify-between text-muted-foreground">
          <span>Tax ({totals.taxRatePercent}%{totals.inclusive ? " incl." : ""})</span>
          <span className="font-mono">{formatPrice(totals.tax)}</span>
        </div>
        {canApplyDiscount && cart.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {discountInputOpen ? (
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">Discount $</span>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  autoFocus
                  value={discountDraft}
                  onChange={(e) => setDiscountDraft(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && applyDiscount()}
                  className="h-7 w-24 font-mono text-xs"
                />
                <Button size="xs" onClick={applyDiscount}>
                  Apply
                </Button>
                <Button size="xs" variant="ghost" onClick={() => setDiscountInputOpen(false)}>
                  Cancel
                </Button>
              </div>
            ) : totals.discount > 0 ? (
              <div className="flex items-center justify-between text-muted-foreground">
                <button
                  type="button"
                  onClick={openDiscountInput}
                  className="flex items-center gap-1 hover:text-foreground"
                >
                  <Tag className="size-3" />
                  Discount
                </button>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono">-{formatPrice(totals.discount)}</span>
                  <button
                    type="button"
                    onClick={removeDiscount}
                    aria-label="Remove discount"
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={openDiscountInput}
                className="flex items-center gap-1 self-start text-xs text-muted-foreground hover:text-foreground"
              >
                <Tag className="size-3" />
                Add discount
              </button>
            )}
          </div>
        )}
        <div className="flex justify-between text-base font-semibold">
          <span>Total</span>
          <span className="font-mono">{formatPrice(totals.total)}</span>
        </div>

        <Button
          size="lg"
          data-tour="pos-charge-btn"
          className="mt-2 touch-target"
          disabled={cart.length === 0 || checkoutDisabled}
          onClick={onCheckout}
        >
          Charge {formatPrice(totals.total)}
        </Button>
      </div>
    </div>
  );
}
