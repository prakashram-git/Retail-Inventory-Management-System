"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip, type TooltipContentProps } from "recharts";
import { useStore } from "@/components/providers/StoreProvider";
import { useChartPalette } from "@/lib/utils/chart-palette";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CategoryRevenueSlice } from "@/lib/reports/aggregate";

function DonutTooltip({
  active,
  payload,
  formatPrice,
}: TooltipContentProps & { formatPrice: (n: number) => string }) {
  if (!active || !payload?.length) return null;
  const entry = payload[0];
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="text-muted-foreground">{entry.name}</p>
      <p className="font-semibold text-foreground">{formatPrice(Number(entry.value ?? 0))}</p>
    </div>
  );
}

export function CategoryRevenueDonut({ slices }: { slices: CategoryRevenueSlice[] }) {
  const { formatPrice } = useStore();
  const palette = useChartPalette();

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Revenue by category</CardTitle>
      </CardHeader>
      <CardContent>
        {slices.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No sales in this range.</p>
        ) : (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="h-56 w-full shrink-0 sm:w-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={slices}
                    dataKey="revenue"
                    nameKey="name"
                    innerRadius="60%"
                    outerRadius="90%"
                    paddingAngle={2}
                    stroke="var(--card)"
                    strokeWidth={2}
                    isAnimationActive={false}
                  >
                    {slices.map((slice, index) => (
                      <Cell
                        key={slice.name}
                        fill={palette.categorical[index % palette.categorical.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip content={(props) => <DonutTooltip {...props} formatPrice={formatPrice} />} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Doubles as the chart's table view — every slice's exact value,
                not just its angle, per the dataviz skill's accessibility pass. */}
            <ul className="flex flex-1 flex-col gap-1.5 text-sm">
              {slices.map((slice, index) => (
                <li key={slice.name} className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{
                        backgroundColor: palette.categorical[index % palette.categorical.length],
                      }}
                    />
                    <span className="truncate">{slice.name}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2 font-mono text-muted-foreground">
                    {formatPrice(slice.revenue)}
                    <span className="w-10 text-right">{(slice.share * 100).toFixed(0)}%</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
