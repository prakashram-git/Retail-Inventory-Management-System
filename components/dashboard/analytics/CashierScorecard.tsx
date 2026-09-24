"use client";

import { useEffect, useState, useTransition } from "react";
import { Crown, Loader2, TriangleAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useStore } from "@/components/providers/StoreProvider";
import { getCashierPerformance } from "@/lib/actions/analytics";
import { cn } from "@/lib/utils";
import type { CashierPerformanceRow, RiskScore } from "@/lib/analytics/types";

const CROWN_COLORS = ["text-amber-500", "text-slate-400", "text-amber-700"];

const RISK_BADGE: Record<RiskScore, { variant: "outline" | "destructive" | "secondary"; label: string }> = {
  low: { variant: "outline", label: "Low" },
  medium: { variant: "secondary", label: "Medium" },
  high: { variant: "destructive", label: "High" },
};

export function CashierScorecard({ className, style }: { className?: string; style?: React.CSSProperties } = {}) {
  const { formatPrice } = useStore();
  const [rows, setRows] = useState<CashierPerformanceRow[]>([]);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    startTransition(async () => {
      setError(null);
      try {
        const end = new Date();
        const start = new Date(end.getTime() - 7 * 86_400_000);
        setRows(await getCashierPerformance(start.toISOString(), end.toISOString()));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load cashier performance");
      }
    });
  }, []);

  return (
    <Card size="sm" className={cn("flex flex-col", className)} style={style}>
      <CardHeader>
        <CardTitle>Cashier leaderboard & loss prevention</CardTitle>
        <CardDescription>Last 7 days · SPLH = sales per labor hour</CardDescription>
      </CardHeader>
      <CardContent>
        {isPending ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading...
          </div>
        ) : error ? (
          <p className="py-4 text-center text-sm text-destructive">{error}</p>
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No cashier activity in this range.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cashier</TableHead>
                  <TableHead className="text-right">Sales</TableHead>
                  <TableHead className="text-right">Hours</TableHead>
                  <TableHead className="text-right">SPLH</TableHead>
                  <TableHead className="text-right">Orders</TableHead>
                  <TableHead className="text-right">AOV</TableHead>
                  <TableHead className="text-right">UPT</TableHead>
                  <TableHead className="text-right">Discount %</TableHead>
                  <TableHead className="text-center">Risk</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, index) => (
                  <TableRow key={row.cashier_id}>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        {index < 3 && row.total_sales_volume > 0 && (
                          <Crown className={cn("size-3.5", CROWN_COLORS[index])} />
                        )}
                        <div className="flex flex-col">
                          <span className="text-sm font-medium">{row.cashier_name}</span>
                          <Badge variant="outline" className="w-fit text-[10px] capitalize">
                            {row.role.replace("_", " ")}
                          </Badge>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">{formatPrice(row.total_sales_volume)}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{row.total_hours_worked.toFixed(1)}h</TableCell>
                    <TableCell className="text-right font-mono text-sm">{formatPrice(row.splh)}/hr</TableCell>
                    <TableCell className="text-right text-sm">{row.transaction_count}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{formatPrice(row.average_ticket_size)}</TableCell>
                    <TableCell className="text-right text-sm">{row.items_per_transaction.toFixed(2)}</TableCell>
                    <TableCell className="text-right text-sm">
                      <span
                        className={cn(
                          row.discount_frequency_rate > 20 && "font-semibold text-amber-600 dark:text-amber-400"
                        )}
                      >
                        {row.discount_frequency_rate.toFixed(1)}%
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={RISK_BADGE[row.risk_score].variant} className="gap-1">
                        {row.risk_score === "high" && <TriangleAlert className="size-3" />}
                        {RISK_BADGE[row.risk_score].label}
                      </Badge>
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
