"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LogOut, Receipt } from "lucide-react";
import { useStore } from "@/components/providers/StoreProvider";
import { useSync } from "@/components/providers/SyncProvider";
import { ConnectionBadge } from "@/components/layout/ConnectionBadge";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { Button } from "@/components/ui/button";
import { logout } from "@/lib/actions/auth";
import { useBarcodeScanner } from "@/lib/pos/use-barcode-scanner";
import { validateGS1Barcode } from "@/lib/utils/barcode";
import { calculateCartTotals } from "@/lib/pos/pricing";
import { getOpenSession, type CashDrawerSession } from "@/lib/pos/session";
import type { CartLine, PosCategory, PosProduct } from "@/lib/pos/types";
import { CatalogGrid } from "./CatalogGrid";
import { CartPanel } from "./CartPanel";
import { MobileCartBar } from "./MobileCartBar";
import { CheckoutModal } from "./CheckoutModal";
import { SisterStoreModal } from "./SisterStoreModal";
import { OpenRegisterDialog } from "./OpenRegisterDialog";
import { CloseShiftModal } from "./CloseShiftModal";
import { TerminalLock } from "./TerminalLock";

interface PosTerminalProps {
  initialProducts: PosProduct[];
  categories: PosCategory[];
  storeId: string;
  cashierId: string;
  cashierName: string;
  storeName: string;
  unitNumber: string | null;
  floorNumber: string | null;
  taxRatePercent: number;
}

export function PosTerminal({
  initialProducts,
  categories,
  storeId,
  cashierId,
  cashierName,
  storeName,
  unitNumber,
  floorNumber,
  taxRatePercent,
}: PosTerminalProps) {
  const router = useRouter();
  const { taxModel } = useStore();
  const { isOnline } = useSync();

  const [products, setProducts] = useState(initialProducts);
  // Adjusted during render (React's documented pattern for resetting state
  // when a prop changes) rather than in an effect, so a post-checkout
  // router.refresh() picks up fresh server stock without an extra render.
  const [syncedProducts, setSyncedProducts] = useState(initialProducts);
  if (initialProducts !== syncedProducts) {
    setSyncedProducts(initialProducts);
    setProducts(initialProducts);
  }

  const [cart, setCart] = useState<CartLine[]>([]);
  const [sisterStoreProduct, setSisterStoreProduct] = useState<PosProduct | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [closeShiftOpen, setCloseShiftOpen] = useState(false);
  const [session, setSession] = useState<CashDrawerSession | null | "loading">("loading");

  useEffect(() => {
    getOpenSession(storeId, cashierId)
      .then(setSession)
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : "Could not check register status");
        setSession(null);
      });
  }, [storeId, cashierId]);

  const addToCart = useCallback((product: PosProduct) => {
    if (product.current_stock <= 0) {
      toast.error(`${product.name} is out of stock`);
      return;
    }
    setCart((prev) => {
      const existing = prev.find((line) => line.product.id === product.id);
      if (existing) {
        if (existing.quantity >= product.current_stock) {
          toast.error(`Only ${product.current_stock} of ${product.name} in stock`);
          return prev;
        }
        return prev.map((line) =>
          line.product.id === product.id ? { ...line, quantity: line.quantity + 1 } : line
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  }, []);

  const handleScan = useCallback(
    (code: string) => {
      // Only GTIN-8/12/13-shaped scans carry a GS1 check digit; a plain
      // alphanumeric SKU never does, so it skips this check and falls
      // through to the SKU match below.
      const isGS1Shaped = /^\d{8}$|^\d{12}$|^\d{13}$/.test(code);
      if (isGS1Shaped && !validateGS1Barcode(code)) {
        toast.error("Invalid barcode scan — check digit mismatch, please rescan");
        return;
      }

      const match = products.find(
        (p) => p.barcode === code || p.sku.toLowerCase() === code.toLowerCase()
      );
      if (!match) {
        toast.error(`No product found for "${code}"`);
        return;
      }
      addToCart(match);
    },
    [products, addToCart]
  );
  useBarcodeScanner(handleScan);

  function incrementLine(productId: string) {
    setCart((prev) =>
      prev.map((line) => {
        if (line.product.id !== productId) return line;
        if (line.quantity >= line.product.current_stock) {
          toast.error(`Only ${line.product.current_stock} in stock`);
          return line;
        }
        return { ...line, quantity: line.quantity + 1 };
      })
    );
  }

  function decrementLine(productId: string) {
    setCart((prev) =>
      prev
        .map((line) =>
          line.product.id === productId ? { ...line, quantity: line.quantity - 1 } : line
        )
        .filter((line) => line.quantity > 0)
    );
  }

  function removeLine(productId: string) {
    setCart((prev) => prev.filter((line) => line.product.id !== productId));
  }

  function clearCart() {
    setCart([]);
  }

  function handleCheckoutSuccess() {
    setProducts((prev) =>
      prev.map((product) => {
        const line = cart.find((l) => l.product.id === product.id);
        if (!line) return product;
        return { ...product, current_stock: Math.max(0, product.current_stock - line.quantity) };
      })
    );
    setCart([]);
    if (isOnline) router.refresh();
  }

  async function handleSignOut() {
    await logout();
    router.push("/login");
  }

  const totals = calculateCartTotals(cart, taxRatePercent, taxModel, 0);
  const registerOpen = session !== "loading" && session !== null;

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex h-14 shrink-0 items-center justify-between border-b bg-background px-3">
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-semibold">{storeName}</span>
          <span className="text-xs text-muted-foreground">{cashierName}</span>
        </div>
        <div className="flex items-center gap-2">
          {registerOpen && (
            <Button
              variant="outline"
              size="sm"
              className="touch-target gap-1.5"
              onClick={() => setCloseShiftOpen(true)}
            >
              <Receipt className="h-4 w-4" />
              <span className="hidden sm:inline">Close Shift / Z-Report</span>
            </Button>
          )}
          <ConnectionBadge />
          <ThemeToggle />
          <Button variant="ghost" size="icon" className="touch-target" onClick={handleSignOut}>
            <LogOut className="h-5 w-5" />
            <span className="sr-only">Sign out</span>
          </Button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-y-auto p-3 pb-24 lg:w-[65%] lg:flex-none lg:pb-3">
          <CatalogGrid
            products={products}
            categories={categories}
            onAdd={addToCart}
            onInspectSisterStores={setSisterStoreProduct}
          />
        </div>

        <div className="hidden w-[35%] shrink-0 border-l lg:block">
          <CartPanel
            cart={cart}
            totals={totals}
            onIncrement={incrementLine}
            onDecrement={decrementLine}
            onRemove={removeLine}
            onClear={clearCart}
            onCheckout={() => setCheckoutOpen(true)}
            checkoutDisabled={!registerOpen}
          />
        </div>
      </div>

      <MobileCartBar
        cart={cart}
        totals={totals}
        onIncrement={incrementLine}
        onDecrement={decrementLine}
        onRemove={removeLine}
        onClear={clearCart}
        onCheckout={() => setCheckoutOpen(true)}
        checkoutDisabled={!registerOpen}
      />

      <CheckoutModal
        open={checkoutOpen}
        onOpenChange={setCheckoutOpen}
        cart={cart}
        totals={totals}
        storeId={storeId}
        sessionId={registerOpen ? (session as CashDrawerSession).id : ""}
        cashierId={cashierId}
        cashierName={cashierName}
        storeName={storeName}
        unitNumber={unitNumber}
        floorNumber={floorNumber}
        onSuccess={handleCheckoutSuccess}
      />

      <SisterStoreModal
        open={!!sisterStoreProduct}
        onOpenChange={(open) => !open && setSisterStoreProduct(null)}
        product={sisterStoreProduct}
        storeId={storeId}
      />

      {session === null && (
        <OpenRegisterDialog storeId={storeId} cashierId={cashierId} onOpened={setSession} />
      )}

      {registerOpen && (
        <CloseShiftModal
          open={closeShiftOpen}
          onOpenChange={setCloseShiftOpen}
          session={session as CashDrawerSession}
          storeName={storeName}
          cashierName={cashierName}
          onClosed={() => setSession(null)}
        />
      )}

      <TerminalLock />
    </div>
  );
}
