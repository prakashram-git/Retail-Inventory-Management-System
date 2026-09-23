"use client";

import { Users } from "lucide-react";
import { useStore } from "@/components/providers/StoreProvider";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { CashierPerformanceRow } from "@/lib/reports/aggregate";

export function CashierPerformanceTable({ rows }: { rows: CashierPerformanceRow[] }) {
  const { formatPrice } = useStore();

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Cashier performance</CardTitle>
        <CardDescription>Net revenue attributed by who rang up the sale</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center text-muted-foreground">
            <Users className="size-6" />
            <p className="text-sm">No sales in this range.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cashier</TableHead>
                <TableHead className="text-right">Orders</TableHead>
                <TableHead className="text-right">Net revenue</TableHead>
                <TableHead className="text-right">Avg. order value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.cashierName}>
                  <TableCell className="font-medium">{row.cashierName}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{row.orders}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{formatPrice(row.revenue)}</TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {formatPrice(row.averageOrderValue)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
