"use client";

import Link from "next/link";
import { PackageX, TriangleAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getEffectiveThreshold, getStockStatus } from "@/lib/utils/inventory";
import type { Category, Product } from "@/lib/types/domain";

interface LowStockRow {
  product: Product;
  threshold: number;
  status: "out" | "low";
}

export function LowStockCard({ products, categories }: { products: Product[]; categories: Category[] }) {
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  const rows: LowStockRow[] = products
    .filter((p) => p.is_active)
    .map((product) => {
      const threshold = getEffectiveThreshold(product, categoryById.get(product.category_id ?? ""));
      const status = getStockStatus(product.current_stock, threshold);
      return { product, threshold, status };
    })
    .filter((row): row is LowStockRow => row.status !== "healthy")
    .sort((a, b) => a.product.current_stock - b.product.current_stock)
    .slice(0, 6);

  return (
    <Card size="sm" className="flex flex-col">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Needs restocking</CardTitle>
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
          rows.map(({ product, threshold, status }) => (
            <div
              key={product.id}
              className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/50"
            >
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium">{product.name}</span>
                <span className="font-mono text-xs text-muted-foreground">{product.sku}</span>
              </div>
              <Badge
                variant={status === "out" ? "destructive" : "outline"}
                className="shrink-0 gap-1 text-xs"
              >
                {status === "out" && <TriangleAlert className="size-3" />}
                {status === "out" ? "Out of stock" : `${product.current_stock} left · min ${threshold}`}
              </Badge>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
