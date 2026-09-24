"use client";
import { cn } from "@/lib/utils";

import { Fragment, useEffect, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useStore } from "@/components/providers/StoreProvider";
import { useChartPalette } from "@/lib/utils/chart-palette";
import { getHourlySalesHeatmap } from "@/lib/actions/analytics";
import type { HeatmapCell } from "@/lib/analytics/types";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatHour(hour: number): string {
  const period = hour < 12 ? "AM" : "PM";
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour}${period}`;
}

export function HourlySalesHeatmap({ className, style }: { className?: string; style?: React.CSSProperties } = {}) {
  const { formatPrice } = useStore();
  const palette = useChartPalette();
  const [cells, setCells] = useState<HeatmapCell[]>([]);
  const [hours, setHours] = useState<{ start: number; end: number }>({ start: 8, end: 22 });
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    startTransition(async () => {
      setError(null);
      try {
        const result = await getHourlySalesHeatmap(8);
        setCells(result.cells);
        setHours(result.operatingHours);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load the heatmap");
      }
    });
  }, []);

  const maxOrders = Math.max(1, ...cells.map((c) => c.orderCount));
  const hourList = Array.from({ length: hours.end - hours.start }, (_, i) => hours.start + i);
  const byKey = new Map(cells.map((c) => [`${c.day}:${c.hour}`, c]));

  return (
    <Card size="sm" className={cn("flex flex-col", className)} style={style}>
      <CardHeader>
        <CardTitle>Peak trading hours</CardTitle>
        <CardDescription>Order volume by day and hour, last 8 weeks (store-local time)</CardDescription>
      </CardHeader>
      <CardContent>
        {isPending ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading...
          </div>
        ) : error ? (
          <p className="py-4 text-center text-sm text-destructive">{error}</p>
        ) : (
          <div className="overflow-x-auto">
            <div className="grid gap-1" style={{ gridTemplateColumns: `48px repeat(${hourList.length}, minmax(28px, 1fr))` }}>
              <div />
              {hourList.map((hour) => (
                <div key={hour} className="text-center text-[10px] text-muted-foreground">
                  {formatHour(hour)}
                </div>
              ))}
              {DAY_LABELS.map((label, day) => (
                <Fragment key={`row-${day}`}>
                  <div className="flex items-center text-xs font-medium text-muted-foreground">
                    {label}
                  </div>
                  {hourList.map((hour) => {
                    const cell = byKey.get(`${day}:${hour}`);
                    const intensity = cell ? cell.orderCount / maxOrders : 0;
                    return (
                      <Tooltip key={`${day}-${hour}`}>
                        <TooltipTrigger
                          render={
                            <div
                              className="aspect-square rounded-sm"
                              style={{
                                backgroundColor:
                                  intensity === 0
                                    ? palette.grid
                                    : `color-mix(in oklch, ${palette.sequential} ${Math.round(20 + intensity * 80)}%, transparent)`,
                              }}
                            />
                          }
                        />
                        <TooltipContent>
                          {label} {formatHour(hour)} — {cell?.orderCount ?? 0} orders
                          {cell && cell.revenue > 0 ? `, ${formatPrice(cell.revenue)}` : ""}
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </Fragment>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
