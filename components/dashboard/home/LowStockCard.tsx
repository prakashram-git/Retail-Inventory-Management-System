"use client";

import Link from "next/link";
import { PackageX, TriangleAlert, PackagePlus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getEffectiveThreshold, getStockStatus } from "@/lib/utils/inventory";
import { suggestReorderQuantity } from "@/lib/reports/aggregate";
import type { Category, Product } from "@/lib/types/domain";

interface LowStockRow {
  product: Product;
  threshold: number;
  status: "out" | "low";
  unitsPerDay: number;
  suggestedQuantity: number;
}

export function LowStockCard({
  products,
  categories,
  velocityByProductId,
}: {
  products: Product[];
  categories: Category[];
  velocityByProductId: Record<string, number>;
}) {
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  const rows: LowStockRow[] = products
    .filter((p) => p.is_active)
    .map((product) => {
      const threshold = getEffectiveThreshold(product, categoryById.get(product.category_id ?? ""));
      const status = getStockStatus(product.current_stock, threshold);
      const unitsPerDay = velocityByProductId[product.id] ?? 0;
      const suggestedQuantity = suggestReorderQuantity(product.current_stock, threshold, unitsPerDay);
      return { product, threshold, status, unitsPerDay, suggestedQuantity };
    })
    .filter((row): row is LowStockRow => row.status !== "healthy")
    .sort((a, b) => a.product.current_stock - b.product.current_stock)
    .slice(0, 6);

  return (
    <Card size="sm" className="flex flex-col transition-shadow hover:shadow-md">
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle>Needs restocking</CardTitle>
          <CardDescription>Suggested quantity is based on the last 30 days of sales</CardDescription>
        </div>
        <Button
          variant="ghost"
          size="sm"
          nativeButton={false}
          render={<Link href="/dashboard/inventory">Manage stock</Link>}
        />
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center text-muted-foreground">
            <PackageX className="size-6" />
            <p className="text-sm">Everything is above threshold.</p>
          </div>
        ) : (
          rows.map(({ product, threshold, status, unitsPerDay, suggestedQuantity }) => (
            <div
              key={product.id}
              className="flex items-center justify-between gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted/50"
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className={statusIconClass(status)}>
                  {status === "out" ? (
                    <PackageX className="size-4" />
                  ) : (
                    <TriangleAlert className="size-4" />
                  )}
                </div>
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium">{product.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">{product.sku}</span>
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <Badge
                  variant={status === "out" ? "destructive" : "outline"}
                  className="shrink-0 gap-1 text-xs"
                >
                  {status === "out" ? "Out of stock" : `${product.current_stock} left · min ${threshold}`}
                </Badge>
                {suggestedQuantity > 0 && (
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <span className="flex items-center gap-1 text-xs font-medium text-primary">
                          <PackagePlus className="size-3" />
                          Order +{suggestedQuantity}
                        </span>
                      }
                    />
                    <TooltipContent>
                      {unitsPerDay > 0
                        ? `Selling ~${unitsPerDay.toFixed(1)}/day over the last 30 days`
                        : "No recent sales — suggestion covers 2x the reorder threshold"}
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function statusIconClass(status: "out" | "low"): string {
  const base = "flex size-8 shrink-0 items-center justify-center rounded-lg";
  return status === "out"
    ? `${base} bg-destructive/10 text-destructive`
    : `${base} bg-amber-500/10 text-amber-600 dark:text-amber-400`;
}
