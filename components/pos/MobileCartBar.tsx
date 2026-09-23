"use client";

import { useState } from "react";
import { ShoppingCart } from "lucide-react";
import { useStore } from "@/components/providers/StoreProvider";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { CartPanel } from "./CartPanel";
import type { CartTotals } from "@/lib/pos/pricing";
import type { CartLine } from "@/lib/pos/types";

interface MobileCartBarProps {
  cart: CartLine[];
  totals: CartTotals;
  onIncrement: (productId: string) => void;
  onDecrement: (productId: string) => void;
  onRemove: (productId: string) => void;
  onClear: () => void;
  onCheckout: () => void;
  checkoutDisabled?: boolean;
}

export function MobileCartBar({
  cart,
  totals,
  onIncrement,
  onDecrement,
  onRemove,
  onClear,
  onCheckout,
  checkoutDisabled,
}: MobileCartBarProps) {
  const { formatPrice } = useStore();
  const [drawerOpen, setDrawerOpen] = useState(false);

  if (cart.length === 0) return null;

  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background p-3 lg:hidden">
        <Button
          size="lg"
          className="w-full touch-target justify-between"
          onClick={() => setDrawerOpen(true)}
        >
          <span className="flex items-center gap-2">
            <ShoppingCart className="size-4" />
            {totals.itemCount} item{totals.itemCount === 1 ? "" : "s"}
          </span>
          <span className="font-mono">{formatPrice(totals.total)}</span>
        </Button>
      </div>

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="bottom" className="h-[85vh] p-0">
          <SheetTitle className="sr-only">Cart</SheetTitle>
          <SheetDescription className="sr-only">Review items before checkout</SheetDescription>
          <CartPanel
            cart={cart}
            totals={totals}
            onIncrement={onIncrement}
            onDecrement={onDecrement}
            onRemove={onRemove}
            onClear={onClear}
            checkoutDisabled={checkoutDisabled}
            onCheckout={() => {
              setDrawerOpen(false);
              onCheckout();
            }}
          />
        </SheetContent>
      </Sheet>
    </>
  );
}
