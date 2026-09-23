"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import { useStore } from "@/components/providers/StoreProvider";
import { useChartPalette } from "@/lib/utils/chart-palette";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { HourlyVelocityPoint } from "@/lib/reports/aggregate";

function HourTooltip({
  active,
  payload,
  label,
  formatPrice,
}: TooltipContentProps & { formatPrice: (n: number) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="text-muted-foreground">{label}</p>
      <p className="font-semibold text-foreground">{formatPrice(Number(payload[0].value ?? 0))}</p>
    </div>
  );
}

export function HourlyVelocityChart({
  points,
  timezoneLabel,
}: {
  points: HourlyVelocityPoint[];
  timezoneLabel: string;
}) {
  const { formatPrice } = useStore();
  const palette = useChartPalette();
  const hasSales = points.some((p) => p.revenue > 0);

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Hourly sales velocity</CardTitle>
        <CardDescription>Store-local time ({timezoneLabel})</CardDescription>
      </CardHeader>
      <CardContent>
        {!hasSales ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No sales in this range.</p>
        ) : (
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={points} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={palette.grid} strokeDasharray="0" />
                <XAxis
                  dataKey="label"
                  interval={3}
                  stroke={palette.axis}
                  tick={{ fill: palette.textMuted, fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: palette.axis }}
                />
                <YAxis
                  stroke={palette.axis}
                  tick={{ fill: palette.textMuted, fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                  width={56}
                  tickFormatter={(value: number) => value.toLocaleString()}
                />
                <Tooltip
                  content={(props) => <HourTooltip {...props} formatPrice={formatPrice} />}
                  cursor={{ fill: palette.grid }}
                />
                <Bar dataKey="revenue" radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false}>
                  {points.map((point) => (
                    <Cell key={point.hour} fill={palette.sequential} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
