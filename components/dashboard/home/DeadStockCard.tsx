"use client";

import { PackageSearch } from "lucide-react";
import { useStore } from "@/components/providers/StoreProvider";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { DeadInventoryRow } from "@/lib/reports/aggregate";

interface DeadStockCardProps {
  rows: DeadInventoryRow[];
  className?: string;
  style?: React.CSSProperties;
}

/** Active products with no net sale in 45+ days, worst cost-tied-up first — read-only, no ledger writes. */
export function DeadStockCard({ rows, className, style }: DeadStockCardProps) {
  const { formatPrice } = useStore();
  const topRows = rows.slice(0, 6);

  return (
    <Card size="sm" data-tour="dash-dead-stock" className={cn("flex flex-col transition-shadow hover:shadow-md", className)} style={style}>
      <CardHeader>
        <CardTitle>Dead stock monitor</CardTitle>
        <CardDescription>No sale in 45+ days, ranked by cost tied up</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        {topRows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center text-muted-foreground">
            <PackageSearch className="size-6" />
            <p className="text-sm">Nothing sitting idle right now.</p>
          </div>
        ) : (
          topRows.map(({ product, daysSinceSale, costTiedUp }) => (
            <div
              key={product.id}
              className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/50"
            >
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium">{product.name}</span>
                <span className="font-mono text-xs text-muted-foreground">{product.sku}</span>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="font-mono text-sm font-medium">{formatPrice(costTiedUp)} tied up</span>
                <Badge variant="outline" className="text-xs">
                  {daysSinceSale != null ? `${daysSinceSale}d since sale` : "Never sold"}
                </Badge>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
