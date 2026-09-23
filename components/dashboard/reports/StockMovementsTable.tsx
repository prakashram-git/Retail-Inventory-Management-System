"use client";

import { useStore } from "@/components/providers/StoreProvider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { StockMovementRow } from "@/lib/reports/types";

const CHANGE_TYPE_LABEL: Record<string, string> = {
  sale: "Sale",
  restock: "Restock",
  adjustment: "Adjustment",
  return: "Return",
  shrinkage: "Shrinkage",
  offline_variance: "Offline variance",
};

const CHANGE_TYPE_VARIANT: Record<string, "outline" | "secondary" | "destructive"> = {
  sale: "outline",
  restock: "secondary",
  adjustment: "outline",
  return: "outline",
  shrinkage: "destructive",
  offline_variance: "destructive",
};

/**
 * Every stock movement in the range — manual adjustments, returns, and
 * offline-sync variances alongside routine sales/restocks — so a shrinkage
 * or variance entry can be traced back to the exact product and note.
 */
export function StockMovementsTable({ rows }: { rows: StockMovementRow[] }) {
  const { formatPrice } = useStore();

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Stock variance & shrinkage audit</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No stock movements logged in this range.
          </p>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(row.created_at).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-sm">{row.product_name}</span>
                        <span className="font-mono text-xs text-muted-foreground">{row.product_sku}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={CHANGE_TYPE_VARIANT[row.change_type] ?? "outline"}>
                        {CHANGE_TYPE_LABEL[row.change_type] ?? row.change_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">{row.quantity}</TableCell>
                    <TableCell className="text-right font-mono text-sm text-muted-foreground">
                      {row.previous_stock} → {row.new_stock}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {formatPrice(row.quantity * row.cost_price)}
                    </TableCell>
                    <TableCell className="max-w-48 truncate text-sm text-muted-foreground">
                      {row.notes ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
