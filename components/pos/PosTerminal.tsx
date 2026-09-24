"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LayoutDashboard, Receipt, KeyRound } from "lucide-react";
import { useStore } from "@/components/providers/StoreProvider";
import { useSync } from "@/components/providers/SyncProvider";
import { ConnectionBadge } from "@/components/layout/ConnectionBadge";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { Button } from "@/components/ui/button";
import { AccountDialog } from "@/components/account/AccountDialog";
import { useSessionGuard } from "@/components/auth/SessionProvider";
import { UserMenu } from "@/components/layout/UserMenu";
import { clearParkedCart, readParkedCart } from "@/lib/pos/parkedCart";
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
import { HelpButton } from "@/components/help/HelpButton";
import { useHelpCenter } from "@/components/help/HelpCenterContext";
import { OpenRegisterDialog } from "./OpenRegisterDialog";
import { CloseShiftModal } from "./CloseShiftModal";
import { TerminalLock } from "./TerminalLock";
import type { UserRole } from "@/lib/types/domain";

interface PosTerminalProps {
  initialProducts: PosProduct[];
  categories: PosCategory[];
  storeId: string;
  role: UserRole;
  cashierId: string;
  cashierName: string;
  cashierPhone: string | null;
  storeName: string;
  unitNumber: string | null;
  floorNumber: string | null;
  taxRatePercent: number;
}

export function PosTerminal({
  initialProducts,
  categories,
  storeId,
  role,
  cashierId,
  cashierName,
  cashierPhone,
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
  const [accountOpen, setAccountOpen] = useState(false);
  const [session, setSession] = useState<CashDrawerSession | null | "loading">("loading");
  const [justClosedShift, setJustClosedShift] = useState(false);

  // Training sandbox: snapshot the real catalog stock and register session when
  // it turns on, and restore them when it turns off, so practice sales (which
  // only decrement local state) never leave a trace.
  const { trainingMode } = useHelpCenter();
  const { registerPos } = useSessionGuard();
  const [prevTraining, setPrevTraining] = useState(false);
  const [trainingSnapshot, setTrainingSnapshot] = useState<{
    products: PosProduct[];
    session: CashDrawerSession | null | "loading";
  } | null>(null);
  if (trainingMode !== prevTraining) {
    setPrevTraining(trainingMode);
    if (trainingMode) {
      setTrainingSnapshot({ products, session });
    } else if (trainingSnapshot) {
      setProducts(trainingSnapshot.products);
      setSession(trainingSnapshot.session);
      setCart([]);
      setTrainingSnapshot(null);
    }
  }

  useEffect(() => {
    getOpenSession(storeId, cashierId)
      .then(setSession)
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : "Could not check register status");
        setSession(null);
      });
  }, [storeId, cashierId]);

  // Expose cart/register state to the session guard so the sign-out dialog can
  // warn about it (and park the cart), and clear it when this view unmounts.
  const registerOpenForGuard = session !== "loading" && session !== null;
  const cartTotalForGuard = calculateCartTotals(cart, taxRatePercent, taxModel, 0).total;
  useEffect(() => {
    registerPos({ cart, drawerOpen: registerOpenForGuard, unitNumber, cartTotal: cartTotalForGuard });
  }, [registerPos, cart, registerOpenForGuard, unitNumber, cartTotalForGuard]);
  useEffect(() => () => registerPos(null), [registerPos]);

  // A cart parked before sign-out / lock comes back on the next visit.
  useEffect(() => {
    let cancelled = false;
    readParkedCart(storeId, cashierId)
      .then(async (parked) => {
        if (!parked || cancelled) return;
        const fresh = new Map(initialProducts.map((p) => [p.id, p]));
        const restored = parked.lines
          .map((line) => {
            const product = fresh.get(line.product.id);
            return product && product.current_stock > 0
              ? { product, quantity: Math.min(line.quantity, product.current_stock) }
              : null;
          })
          .filter((line): line is CartLine => line !== null);
        await clearParkedCart(storeId, cashierId);
        if (cancelled || restored.length === 0) return;
        setCart((prev) => (prev.length === 0 ? restored : prev));
        toast.success("Restored your parked cart");
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // Once per mount: initialProducts is only the seed for matching lines.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // Training sales never touched the server, so there is nothing to refresh.
    if (isOnline && !trainingMode) router.refresh();
  }

  function handleCloseShiftRequest() {
    if (cart.length > 0) {
      toast.error("Finish or clear the current sale before closing your shift.");
      return;
    }
    setCloseShiftOpen(true);
  }

  const totals = calculateCartTotals(cart, taxRatePercent, taxModel, 0);
  const registerOpen = session !== "loading" && session !== null;

  return (
    <div className="flex h-dvh flex-col">
      {trainingMode && (
        <div
          role="status"
          data-testid="training-banner"
          className="bg-amber-500 px-3 py-1 text-center text-xs font-semibold text-black"
        >
          TRAINING MODE — practice only. Sales, stock and till sessions are not saved.
        </div>
      )}
      <header className="flex h-14 shrink-0 items-center justify-between border-b bg-background px-3">
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-semibold">{storeName}</span>
          <span className="text-xs text-muted-foreground">{cashierName}</span>
        </div>
        <div className="flex items-center gap-2">
          {role !== "cashier" && (
            <Button
              variant="ghost"
              size="sm"
              className="touch-target gap-1.5"
              nativeButton={false}
              render={<Link href="/dashboard" />}
            >
              <LayoutDashboard className="h-4 w-4" />
              <span className="hidden sm:inline">Dashboard</span>
            </Button>
          )}
          {registerOpen && (
            <Button
              variant="outline"
              size="sm"
              className="touch-target gap-1.5"
              data-tour="pos-close-shift"
              onClick={handleCloseShiftRequest}
            >
              <Receipt className="h-4 w-4" />
              <span className="hidden sm:inline">Close Shift / Z-Report</span>
            </Button>
          )}
          <span data-tour="pos-connection"><ConnectionBadge /></span>
          <HelpButton workflowId="wf_barcode_checkout" />
          <ThemeToggle />
          <Button
            variant="ghost"
            size="icon"
            className="touch-target"
            onClick={() => setAccountOpen(true)}
          >
            <KeyRound className="h-5 w-5" />
            <span className="sr-only">Account</span>
          </Button>
          <UserMenu />
        </div>
      </header>

      <AccountDialog open={accountOpen} onOpenChange={setAccountOpen} initialPhone={cashierPhone} />

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
        <OpenRegisterDialog
          storeId={storeId}
          cashierId={cashierId}
          justClosedShift={justClosedShift}
          onOpened={(next) => {
            setJustClosedShift(false);
            setSession(next);
          }}
        />
      )}

      {registerOpen && (
        <CloseShiftModal
          open={closeShiftOpen}
          onOpenChange={setCloseShiftOpen}
          session={session as CashDrawerSession}
          storeName={storeName}
          cashierName={cashierName}
          onClosed={() => {
            setJustClosedShift(true);
            setSession(null);
            setCart([]);
          }}
        />
      )}

      <TerminalLock />
    </div>
  );
}
