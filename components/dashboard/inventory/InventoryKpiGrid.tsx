"use client";

import type { LucideIcon } from "lucide-react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface KpiItem {
  label: string;
  value: string;
  icon: LucideIcon;
  tone?: "default" | "warning" | "destructive";
  mono?: boolean;
  /** Percent change vs. a comparison period; null/undefined omits the badge
   * (e.g. the previous period had no baseline to compare against). Positive
   * isn't always "good" (shrinkage rising is bad), so callers that need
   * inverted coloring pass `deltaInverse`. */
  delta?: number | null;
  deltaInverse?: boolean;
}

export function InventoryKpiGrid({ items }: { items: KpiItem[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map((item) => (
        <Card key={item.label} size="sm">
          <CardContent className="flex items-center gap-3">
            <div
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-lg",
                item.tone === "destructive" && "bg-destructive/10 text-destructive",
                item.tone === "warning" && "bg-destructive/10 text-destructive",
                (!item.tone || item.tone === "default") && "bg-primary/10 text-primary"
              )}
            >
              <item.icon className="size-4" />
            </div>
            <div className="flex min-w-0 flex-col">
              <span className="text-xs text-muted-foreground">{item.label}</span>
              <span className={cn("truncate text-lg font-semibold", item.mono && "font-mono")}>
                {item.value}
              </span>
              {item.delta != null && (
                <DeltaBadge value={item.delta} inverse={item.deltaInverse} />
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function DeltaBadge({ value, inverse }: { value: number; inverse?: boolean }) {
  const isFlat = Math.abs(value) < 0.05;
  const isUp = value > 0;
  const isGood = isFlat ? null : inverse ? !isUp : isUp;

  return (
    <span
      className={cn(
        "flex items-center gap-0.5 text-xs font-medium",
        isFlat && "text-muted-foreground",
        isGood === true && "text-emerald-600 dark:text-emerald-400",
        isGood === false && "text-destructive"
      )}
    >
      {!isFlat && (isUp ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
      {isFlat ? "Flat" : `${Math.abs(value).toFixed(1)}%`}
      <span className="font-normal text-muted-foreground">vs prev.</span>
    </span>
  );
}
