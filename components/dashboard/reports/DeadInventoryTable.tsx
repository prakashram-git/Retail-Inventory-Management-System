"use client";

import { useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useStore } from "@/components/providers/StoreProvider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CategorySelect, type SelectableCategory } from "@/components/dashboard/inventory/CategorySelect";
import type { DeadInventoryRow } from "@/lib/reports/aggregate";

interface DeadInventoryTableProps {
  rows: DeadInventoryRow[];
  categories: SelectableCategory[];
}

export function DeadInventoryTable({ rows, categories }: DeadInventoryTableProps) {
  const { formatPrice } = useStore();
  const [categoryFilter, setCategoryFilter] = useState("all");

  const filtered = useMemo(() => {
    if (categoryFilter === "all") return rows;
    return rows.filter((row) => {
      const category = categories.find((c) => c.id === row.product.category_id);
      return row.product.category_id === categoryFilter || category?.parent_id === categoryFilter;
    });
  }, [rows, categoryFilter, categories]);

  const totalCostTiedUp = filtered.reduce((sum, row) => sum + row.costTiedUp, 0);

  return (
    <Card size="sm">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-muted-foreground" />
            Dead inventory
          </CardTitle>
          <CardDescription>Active items with no net sales in the last 45 days.</CardDescription>
        </div>
        <div className="w-44 shrink-0">
          <CategorySelect
            categories={categories}
            value={categoryFilter}
            onValueChange={setCategoryFilter}
            noneLabel="All categories"
            noneValue="all"
          />
        </div>
      </CardHeader>
      <CardContent>
        {filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nothing is sitting dead right now — every active item has sold within 45 days.
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead className="text-right">Cost tied up</TableHead>
                  <TableHead>Last sale</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((row) => (
                  <TableRow key={row.product.id}>
                    <TableCell className="font-mono text-sm">{row.product.sku}</TableCell>
                    <TableCell className="max-w-48 truncate text-sm">{row.product.name}</TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {row.product.current_stock}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {formatPrice(row.costTiedUp)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {row.daysSinceSale == null ? (
                        <Badge variant="outline">Never sold</Badge>
                      ) : (
                        `${row.daysSinceSale}d ago`
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="flex justify-end border-t bg-muted/50 px-3 py-2 text-sm font-medium">
              Total tied up: <span className="ml-1 font-mono">{formatPrice(totalCostTiedUp)}</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
