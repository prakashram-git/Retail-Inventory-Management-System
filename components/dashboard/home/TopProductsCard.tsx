"use client";

import { Trophy } from "lucide-react";
import { useStore } from "@/components/providers/StoreProvider";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import type { TopProductRow } from "@/lib/reports/aggregate";

export function TopProductsCard({ products }: { products: TopProductRow[] }) {
  const { formatPrice } = useStore();
  const maxRevenue = Math.max(1, ...products.map((p) => p.revenue));

  return (
    <Card size="sm" className="flex flex-col transition-shadow hover:shadow-md">
      <CardHeader>
        <CardTitle>Top sellers this week</CardTitle>
        <CardDescription>By net revenue, last 7 days</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {products.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center text-muted-foreground">
            <Trophy className="size-6" />
            <p className="text-sm">No sales in the last 7 days.</p>
          </div>
        ) : (
          products.map((product, index) => (
            <div key={product.productId} className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="w-4 shrink-0 text-xs font-medium text-muted-foreground">
                    {index + 1}
                  </span>
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-medium">{product.name}</span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {product.sku} · {product.quantity} sold
                    </span>
                  </div>
                </div>
                <span className="shrink-0 font-mono text-sm font-medium">
                  {formatPrice(product.revenue)}
                </span>
              </div>
              <div className="ml-6 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${Math.max(4, (product.revenue / maxRevenue) * 100)}%` }}
                />
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
