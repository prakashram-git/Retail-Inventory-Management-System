"use client";

import { useState } from "react";
import { ExternalLink, Package, Search } from "lucide-react";
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
  const [imageFailed, setImageFailed] = useState(false);
  const outOfStock = product.current_stock <= 0;
  const showImage = Boolean(product.image_url) && !imageFailed;
  const imageCreditUrl = showImage ? getImageCreditUrl(product.image_url) : null;

  return (
    <Card
      size="sm"
      data-tour="pos-product-card"
      className="relative min-h-[120px] overflow-hidden p-0"
    >
      <button
        type="button"
        onClick={onAdd}
        disabled={outOfStock}
        className="flex min-h-[120px] w-full flex-col gap-1.5 p-3 text-left transition-transform active:scale-95 disabled:cursor-not-allowed"
      >
        <div className="flex items-center justify-center rounded-md bg-muted text-muted-foreground">
          {showImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={product.image_url ?? undefined}
              alt={product.name}
              onError={() => setImageFailed(true)}
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

      {imageCreditUrl && (
        <a
          href={imageCreditUrl}
          target="_blank"
          rel="noreferrer"
          aria-label={`View image source and license for ${product.name}`}
          title="Image source and license"
          className="absolute right-2 top-2 z-10 inline-flex size-7 items-center justify-center rounded-md bg-background/90 text-foreground shadow-sm ring-1 ring-border hover:bg-background"
          onClick={(event) => event.stopPropagation()}
        >
          <ExternalLink className="size-3.5" />
        </a>
      )}

      {outOfStock && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/90 p-3 text-center backdrop-blur-sm">
          <Badge variant="destructive">Out of Stock</Badge>
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-tour="pos-sister-store-btn"
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

function getImageCreditUrl(imageUrl: string | null): string | null {
  if (!imageUrl) return null;

  try {
    const url = new URL(imageUrl);
    if (url.hostname === "api.openverse.org") {
      const pathParts = url.pathname.split("/").filter(Boolean);
      const imageIndex = pathParts.indexOf("images");
      const imageId = imageIndex >= 0 ? pathParts[imageIndex + 1] : null;
      return imageId ? `https://api.openverse.org/v1/images/${imageId}/` : null;
    }
    if (!url.hostname.endsWith("wikimedia.org")) return null;

    const pathParts = url.pathname.split("/").filter(Boolean);
    const thumbIndex = pathParts.indexOf("thumb");
    const fileName = thumbIndex >= 0 ? pathParts[pathParts.length - 2] : pathParts[pathParts.length - 1];
    if (!fileName) return null;

    return `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(decodeURIComponent(fileName))}`;
  } catch {
    return null;
  }
}
