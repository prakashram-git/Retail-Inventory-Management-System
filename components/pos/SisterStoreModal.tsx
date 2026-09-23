"use client";

import { useEffect, useState } from "react";
import { MapPin, TriangleAlert } from "lucide-react";
import { useStore } from "@/components/providers/StoreProvider";
import { checkMallInventory, type SisterStoreStock } from "@/lib/pos/mall-inventory";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import type { PosProduct } from "@/lib/pos/types";

interface SisterStoreModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: PosProduct | null;
  storeId: string;
}

export function SisterStoreModal({ open, onOpenChange, product, storeId }: SisterStoreModalProps) {
  const { formatPrice } = useStore();
  const [loading, setLoading] = useState(false);
  const [stores, setStores] = useState<SisterStoreStock[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    if (!open || !product) return;

    let cancelled = false;
    // Resets lookup state for the newly opened/changed product before the
    // async RPC call resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setStores(null);
    setUnavailable(false);

    checkMallInventory(product.sku, storeId)
      .then((rows) => {
        if (!cancelled) setStores(rows);
      })
      .catch(() => {
        if (!cancelled) setUnavailable(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, product, storeId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Sister store stock</DialogTitle>
          <DialogDescription>
            {product ? `Availability of "${product.name}" at other mall stores.` : ""}
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <p className="py-6 text-center text-sm text-muted-foreground">Checking the mall...</p>
        )}

        {!loading && unavailable && (
          <Alert variant="destructive">
            <TriangleAlert />
            <AlertDescription>
              Sister-store lookup isn&apos;t available right now. Ask a manager to check with
              other stores directly.
            </AlertDescription>
          </Alert>
        )}

        {!loading && !unavailable && stores && stores.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No other store in the mall currently stocks this SKU.
          </p>
        )}

        {!loading && !unavailable && stores && stores.length > 0 && (
          <ul className="flex flex-col gap-2">
            {stores.map((store) => (
              <li
                key={store.store_id}
                className="flex items-center justify-between rounded-lg border px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <MapPin className="size-4 text-muted-foreground" />
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">{store.store_name}</span>
                    {store.unit_number && (
                      <span className="text-xs text-muted-foreground">
                        Unit {store.unit_number}
                        {store.floor_number ? ` · Floor ${store.floor_number}` : ""}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Badge variant={store.current_stock > 0 ? "secondary" : "outline"}>
                    {store.current_stock > 0 ? `${store.current_stock} in stock` : "Out of stock"}
                  </Badge>
                  <span className="font-mono text-xs text-muted-foreground">
                    {formatPrice(store.retail_price)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
