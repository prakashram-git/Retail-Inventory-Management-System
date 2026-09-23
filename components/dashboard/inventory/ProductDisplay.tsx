"use client";

import { Package } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress, ProgressTrack, ProgressIndicator } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { computeMarginPercent, getStockStatus } from "@/lib/utils/inventory";
import type { ProductWithCategory } from "@/lib/types/domain";

export function ProductThumbnail({ product }: { product: ProductWithCategory }) {
  if (product.image_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={product.image_url}
        alt={product.name}
        className="size-10 shrink-0 rounded-md object-cover ring-1 ring-border"
      />
    );
  }
  return (
    <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground ring-1 ring-border">
      <Package className="size-4" />
    </div>
  );
}

export function CategoryBadge({ category }: { category: ProductWithCategory["category"] }) {
  if (!category) {
    return <Badge variant="outline">Uncategorized</Badge>;
  }
  return <Badge variant="secondary">{category.name}</Badge>;
}

export function MarginBadge({ costPrice, retailPrice }: { costPrice: number; retailPrice: number }) {
  const margin = computeMarginPercent(costPrice, retailPrice);
  return (
    <span
      className={cn(
        "font-mono text-sm tabular-nums",
        margin < 20 ? "text-destructive" : margin < 40 ? "text-muted-foreground" : "text-foreground"
      )}
    >
      {margin.toFixed(1)}%
    </span>
  );
}

export function StockBar({
  currentStock,
  threshold,
}: {
  currentStock: number;
  threshold: number;
}) {
  const status = getStockStatus(currentStock, threshold);
  const reference = Math.max(threshold * 2, 1);
  const value = Math.min(100, (currentStock / reference) * 100);

  return (
    <div className="flex w-32 flex-col gap-1">
      <div className="flex items-center justify-between text-xs">
        <span
          className={cn(
            "font-mono tabular-nums",
            status === "out" && "text-destructive font-medium",
            status === "low" && "text-destructive"
          )}
        >
          {currentStock}
        </span>
        <span className="text-muted-foreground">min {threshold}</span>
      </div>
      <Progress value={value}>
        <ProgressTrack>
          <ProgressIndicator
            className={cn(
              status === "out" && "bg-destructive",
              status === "low" && "bg-destructive/70"
            )}
          />
        </ProgressTrack>
      </Progress>
    </div>
  );
}

export function StockStatusBadge({
  currentStock,
  threshold,
}: {
  currentStock: number;
  threshold: number;
}) {
  const status = getStockStatus(currentStock, threshold);
  if (status === "out") return <Badge variant="destructive">Out of stock</Badge>;
  if (status === "low") return <Badge variant="destructive">Low stock</Badge>;
  return <Badge variant="outline">In stock</Badge>;
}
