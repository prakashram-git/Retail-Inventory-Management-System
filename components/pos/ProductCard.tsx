"use client";

import { Package, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useStore } from "@/components/providers/StoreProvider";
import type { PosProduct } from "@/lib/pos/types";

interface ProductCardProps {
  product: PosProduct;
  onAdd: () => void;
  onInspectSisterStores: () => void;
}

export function ProductCard({ product, onAdd, onInspectSisterStores }: ProductCardProps) {
  const { formatPrice } = useStore();
  const outOfStock = product.current_stock <= 0;

  return (
    <Card
      size="sm"
      className="relative overflow-hidden p-0"
    >
      <button
        type="button"
        onClick={onAdd}
        disabled={outOfStock}
        className="flex min-h-[120px] w-full flex-col gap-1.5 p-3 text-left transition-transform active:scale-95 disabled:cursor-not-allowed"
      >
        <div className="flex items-center justify-center rounded-md bg-muted text-muted-foreground">
          {product.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={product.image_url}
              alt={product.name}
              className="h-16 w-full rounded-md object-cover"
            />
          ) : (
            <div className="flex h-16 w-full items-center justify-center">
              <Package className="size-6" />
            </div>
          )}
        </div>

        <span className="line-clamp-2 text-sm font-medium leading-snug">{product.name}</span>

        <div className="mt-auto flex items-center justify-between gap-1">
          <span className="font-mono text-sm">{formatPrice(product.retail_price)}</span>
          {product.category && (
            <Badge variant="outline" className="max-w-24 truncate text-[10px]">
              {product.category.name}
            </Badge>
          )}
        </div>
      </button>

      {outOfStock && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/90 p-3 text-center backdrop-blur-sm">
          <Badge variant="destructive">Out of Stock</Badge>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onInspectSisterStores();
            }}
          >
            <Search />
            Inspect Sister Stores
          </Button>
        </div>
      )}
    </Card>
  );
}
