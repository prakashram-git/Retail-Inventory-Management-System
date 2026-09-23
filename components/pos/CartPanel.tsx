"use client";

import { Minus, Plus, ShoppingCart, Trash2, X } from "lucide-react";
import { useStore } from "@/components/providers/StoreProvider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
}: CartPanelProps) {
  const { formatPrice } = useStore();

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-4 py-3">
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
        {totals.discount > 0 && (
          <div className="flex justify-between text-muted-foreground">
            <span>Discount</span>
            <span className="font-mono">-{formatPrice(totals.discount)}</span>
          </div>
        )}
        <div className="flex justify-between text-base font-semibold">
          <span>Total</span>
          <span className="font-mono">{formatPrice(totals.total)}</span>
        </div>

        <Button
          size="lg"
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
