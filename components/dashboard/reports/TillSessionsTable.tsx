"use client";

import { useState } from "react";
import { Printer } from "lucide-react";
import { useStore } from "@/components/providers/StoreProvider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ReprintZReportModal } from "./ReprintZReportModal";
import type { TillSessionRow } from "@/lib/reports/types";

export function TillSessionsTable({ rows }: { rows: TillSessionRow[] }) {
  const { formatPrice } = useStore();
  const [reprintTarget, setReprintTarget] = useState<TillSessionRow | null>(null);

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Till sessions</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No shifts opened in this range.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cashier</TableHead>
                <TableHead>Opened</TableHead>
                <TableHead>Closed</TableHead>
                <TableHead className="text-right">Opening float</TableHead>
                <TableHead className="text-right">Expected</TableHead>
                <TableHead className="text-right">Counted</TableHead>
                <TableHead className="text-right">Variance</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const isClosed = row.status === "closed" && row.discrepancy != null;
                return (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.cashier_name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(row.opened_at).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {row.closed_at ? (
                        new Date(row.closed_at).toLocaleString()
                      ) : (
                        <Badge variant="outline">Open</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {formatPrice(row.opening_float)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {row.expected_cash != null ? formatPrice(row.expected_cash) : "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {row.closing_counted_cash != null ? formatPrice(row.closing_counted_cash) : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {row.discrepancy != null ? (
                        <span
                          className={`font-mono text-sm ${
                            row.discrepancy < 0
                              ? "text-destructive"
                              : row.discrepancy > 0
                                ? "text-amber-600 dark:text-amber-400"
                                : "text-muted-foreground"
                          }`}
                        >
                          {row.discrepancy < 0 ? "-" : row.discrepancy > 0 ? "+" : ""}
                          {formatPrice(Math.abs(row.discrepancy))}
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      {isClosed && (
                        <Button variant="ghost" size="icon-sm" onClick={() => setReprintTarget(row)}>
                          <Printer />
                          <span className="sr-only">Reprint Z-report</span>
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <ReprintZReportModal
        session={reprintTarget}
        onOpenChange={(open) => !open && setReprintTarget(null)}
      />
    </Card>
  );
}
