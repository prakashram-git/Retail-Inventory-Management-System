"use client";
import { cn } from "@/lib/utils";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Loader2, PackageSearch } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useStore } from "@/components/providers/StoreProvider";
import { getInventoryHealth } from "@/lib/actions/analytics";
import type { InventoryHealthBucket } from "@/lib/analytics/types";

const BUCKET_ORDER: InventoryHealthBucket["bucket"][] = ["30-59", "60-89", "90+"];
const BUCKET_LABEL: Record<InventoryHealthBucket["bucket"], string> = {
  "30-59": "30-59 days",
  "60-89": "60-89 days",
  "90+": "90+ days",
};
const BUCKET_COLOR: Record<InventoryHealthBucket["bucket"], string> = {
  "30-59": "bg-amber-400",
  "60-89": "bg-orange-500",
  "90+": "bg-destructive",
};

/**
 * A distinct widget from components/dashboard/home/DeadStockCard.tsx (the
 * existing simple "no sale in 45+ days" list, kept as-is) — this one buckets
 * by age tier with capital-locked totals per bucket, sourced from
 * get_inventory_health_metrics rather than the client-side buildDeadInventory
 * aggregate.
 */
export function DeadStockAgingCard({ className, style }: { className?: string; style?: React.CSSProperties } = {}) {
  const { formatPrice } = useStore();
  const [buckets, setBuckets] = useState<InventoryHealthBucket[]>([]);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    startTransition(async () => {
      setError(null);
      try {
        const health = await getInventoryHealth();
        setBuckets(health.dead_stock_aging);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load inventory health");
      }
    });
  }, []);

  const byBucket = new Map(buckets.map((b) => [b.bucket, b]));
  const maxCapital = Math.max(1, ...buckets.map((b) => b.capital_locked));
  const totalCapital = buckets.reduce((sum, b) => sum + b.capital_locked, 0);

  return (
    <Card size="sm" className={cn("flex flex-col", className)} style={style}>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle>Dead stock aging</CardTitle>
          <CardDescription>Capital locked in unsold, in-stock inventory</CardDescription>
        </div>
        <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/dashboard/inventory" />}>
          Promote / Discount
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {isPending ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading...
          </div>
        ) : error ? (
          <p className="py-4 text-center text-sm text-destructive">{error}</p>
        ) : totalCapital === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center text-muted-foreground">
            <PackageSearch className="size-6" />
            <p className="text-sm">No aging dead stock — everything is moving.</p>
          </div>
        ) : (
          <>
            <p className="text-2xl font-semibold font-mono">{formatPrice(totalCapital)}</p>
            <p className="-mt-3 text-xs text-muted-foreground">Total capital tied up in dead stock</p>
            {BUCKET_ORDER.map((bucket) => {
              const entry = byBucket.get(bucket);
              const capital = entry?.capital_locked ?? 0;
              const count = entry?.sku_count ?? 0;
              return (
                <div key={bucket} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{BUCKET_LABEL[bucket]}</span>
                    <span className="font-mono text-muted-foreground">
                      {formatPrice(capital)} · {count} {count === 1 ? "SKU" : "SKUs"}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full ${BUCKET_COLOR[bucket]}`}
                      style={{ width: `${Math.max(2, (capital / maxCapital) * 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </>
        )}
      </CardContent>
    </Card>
  );
}
