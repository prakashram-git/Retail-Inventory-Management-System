"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import { useStore } from "@/components/providers/StoreProvider";
import { useChartPalette } from "@/lib/utils/chart-palette";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { RevenueCogsPoint } from "@/lib/reports/aggregate";

function LegendKey({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className="h-0.5 w-3 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

function AreaTooltip({
  active,
  payload,
  label,
  formatPrice,
}: TooltipContentProps & { formatPrice: (n: number) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1 text-muted-foreground">{label}</p>
      {payload.map((entry: NonNullable<typeof payload>[number]) => (
        <div key={String(entry.dataKey)} className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="h-0.5 w-3 rounded-full" style={{ backgroundColor: entry.color }} />
            {entry.name}
          </span>
          <span className="font-semibold text-foreground">{formatPrice(Number(entry.value ?? 0))}</span>
        </div>
      ))}
    </div>
  );
}

export function RevenueCogsAreaChart({ points }: { points: RevenueCogsPoint[] }) {
  const { formatPrice } = useStore();
  const palette = useChartPalette();
  const revenueColor = palette.categorical[0];
  const cogsColor = palette.categorical[1];

  const totalRevenue = points.reduce((sum, p) => sum + p.revenue, 0);
  const totalCogs = points.reduce((sum, p) => sum + p.cogs, 0);
  const grossMarginPercent = totalRevenue > 0 ? ((totalRevenue - totalCogs) / totalRevenue) * 100 : 0;

  return (
    <Card size="sm" className="transition-shadow hover:shadow-md">
      <CardHeader>
        <CardTitle>Revenue vs. COGS</CardTitle>
        <CardDescription>
          {formatPrice(totalRevenue)} revenue · {formatPrice(totalCogs)} COGS ·{" "}
          {grossMarginPercent.toFixed(1)}% gross margin
        </CardDescription>
      </CardHeader>
      <CardContent>
        {points.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No sales in this range.</p>
        ) : (
          <>
            <div className="mb-2 flex items-center gap-4">
              <LegendKey color={revenueColor} label="Revenue" />
              <LegendKey color={cogsColor} label="COGS" />
            </div>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={points} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={revenueColor} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={revenueColor} stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="cogsFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={cogsColor} stopOpacity={0.3} />
                      <stop offset="100%" stopColor={cogsColor} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke={palette.grid} strokeDasharray="0" />
                  <XAxis
                    dataKey="label"
                    stroke={palette.axis}
                    tick={{ fill: palette.textMuted, fontSize: 12 }}
                    tickLine={false}
                    axisLine={{ stroke: palette.axis }}
                    minTickGap={16}
                  />
                  <YAxis
                    stroke={palette.axis}
                    tick={{ fill: palette.textMuted, fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                    width={56}
                    tickFormatter={(value: number) => value.toLocaleString()}
                  />
                  <Tooltip content={(props) => <AreaTooltip {...props} formatPrice={formatPrice} />} />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    name="Revenue"
                    stroke={revenueColor}
                    strokeWidth={2}
                    fill="url(#revenueFill)"
                    isAnimationActive={false}
                  />
                  <Area
                    type="monotone"
                    dataKey="cogs"
                    name="COGS"
                    stroke={cogsColor}
                    strokeWidth={2}
                    fill="url(#cogsFill)"
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
