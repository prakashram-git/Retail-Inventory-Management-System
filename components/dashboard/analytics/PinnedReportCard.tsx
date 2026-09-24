"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Loader2, LibraryBig } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getReportDefinition } from "@/lib/reports/catalog";
import { getBuilderRangeBounds } from "@/lib/reports/builderRanges";
import { executeReport } from "@/lib/actions/reports";
import { cn } from "@/lib/utils";

interface PinnedReportCardProps {
  reportId: string;
  className?: string;
  style?: React.CSSProperties;
}

/** A read-only, view-only rendering of one Report Library template pinned to
 * the dashboard by a ui_designer — no export/column controls here, those
 * live in the full builder at /dashboard/reports/library. */
export function PinnedReportCard({ reportId, className, style }: PinnedReportCardProps) {
  const definition = getReportDefinition(reportId);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!definition) return;
    startTransition(async () => {
      setError(null);
      try {
        const { from, to } = getBuilderRangeBounds("mtd", "UTC");
        const result = await executeReport({
          reportId,
          allStores: false,
          startDate: from.toISOString(),
          endDate: to.toISOString(),
          groupBy: definition.defaultGroupBy,
          limit: 8,
        });
        setRows(result.rows.slice(0, 8));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load this report");
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportId]);

  if (!definition) {
    return (
      <Card size="sm" className={cn("flex flex-col", className)} style={style}>
        <CardContent className="py-8 text-center text-sm text-destructive">Unknown report: {reportId}</CardContent>
      </Card>
    );
  }

  const columns = definition.columns.slice(0, 6);

  return (
    <Card size="sm" className={cn("flex flex-col", className)} style={style}>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle>{definition.title}</CardTitle>
          <CardDescription>Month-to-date · pinned report</CardDescription>
        </div>
        <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/dashboard/reports/library" />}>
          <LibraryBig /> Open in builder
        </Button>
      </CardHeader>
      <CardContent>
        {isPending ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading...
          </div>
        ) : error ? (
          <p className="py-4 text-center text-sm text-destructive">{error}</p>
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No data in this range.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {columns.map((c) => (
                    <TableHead key={c.key}>{c.label}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, i) => (
                  <TableRow key={i}>
                    {columns.map((c) => (
                      <TableCell key={c.key} className="text-sm">
                        {String(row[c.key] ?? "—")}
                      </TableCell>
                    ))}
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
