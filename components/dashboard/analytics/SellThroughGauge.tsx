"use client";
import { cn } from "@/lib/utils";

import { useEffect, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { RadialBar, RadialBarChart, PolarAngleAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useChartPalette } from "@/lib/utils/chart-palette";
import { getInventoryHealth } from "@/lib/actions/analytics";

const HEALTHY_MIN = 60;
const HEALTHY_MAX = 80;

export function SellThroughGauge({ className, style }: { className?: string; style?: React.CSSProperties } = {}) {
  const palette = useChartPalette();
  const [rate, setRate] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    startTransition(async () => {
      setError(null);
      try {
        const health = await getInventoryHealth();
        setRate(health.sell_through_rate_30d);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load sell-through rate");
      }
    });
  }, []);

  const value = rate ?? 0;
  const inHealthyRange = value >= HEALTHY_MIN && value <= HEALTHY_MAX;
  const color = inHealthyRange ? palette.status.good : value < HEALTHY_MIN ? palette.status.warning : palette.status.serious;

  const data = [{ name: "sell-through", value, fill: color }];

  return (
    <Card size="sm" className={cn("flex flex-col", className)} style={style}>
      <CardHeader>
        <CardTitle>Sell-through rate</CardTitle>
        <CardDescription>Last 30 days · healthy retail corridor is 60-80%</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-2">
        {isPending ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading...
          </div>
        ) : error ? (
          <p className="py-4 text-center text-sm text-destructive">{error}</p>
        ) : (
          <>
            <div className="relative h-40 w-40">
              <RadialBarChart
                width={160}
                height={160}
                data={data}
                startAngle={90}
                endAngle={-270}
                innerRadius="75%"
                outerRadius="100%"
              >
                <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
                <RadialBar dataKey="value" cornerRadius={8} background={{ fill: palette.grid }} />
              </RadialBarChart>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-mono text-2xl font-semibold">{value.toFixed(1)}%</span>
                <span className={`text-xs font-medium ${inHealthyRange ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>
                  {inHealthyRange ? "Healthy" : value < HEALTHY_MIN ? "Overstocked" : "Understocked"}
                </span>
              </div>
            </div>
            <p className="text-center text-xs text-muted-foreground">
              Units sold ÷ (current stock + units sold), active products, trailing 30 days
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
