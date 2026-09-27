"use client";

import type { LucideIcon } from "lucide-react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface KpiItem {
  label: string;
  value: string;
  icon: LucideIcon;
  tone?: "default" | "warning" | "destructive" | "success" | "info" | "accent";
  mono?: boolean;
  /** Percent change vs. a comparison period; null/undefined omits the badge
   * (e.g. the previous period had no baseline to compare against). Positive
   * isn't always "good" (shrinkage rising is bad), so callers that need
   * inverted coloring pass `deltaInverse`. */
  delta?: number | null;
  deltaInverse?: boolean;
}

export function InventoryKpiGrid({ items, compact }: { items: KpiItem[]; compact?: boolean }) {
  return (
    <div className={cn("grid grid-cols-2 gap-3 lg:grid-cols-4", compact && "gap-2")}>
      {items.map((item) => (
        <Card
          key={item.label}
          size="sm"
          className={cn("transition-shadow hover:shadow-md", compact && "[--card-spacing:--spacing(1)]")}
        >
          <CardContent className={cn("flex items-center gap-3", compact && "gap-1")}>
            <div
              className={cn(
                "flex size-10 shrink-0 items-center justify-center rounded-xl",
                compact && "size-5 rounded-md",
                item.tone === "destructive" && "bg-destructive/10 text-destructive",
                item.tone === "warning" && "bg-amber-500/10 text-amber-600 dark:text-amber-400",
                item.tone === "success" && "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
                item.tone === "info" && "bg-sky-500/10 text-sky-600 dark:text-sky-400",
                item.tone === "accent" && "bg-violet-500/10 text-violet-600 dark:text-violet-400",
                (!item.tone || item.tone === "default") && "bg-primary/10 text-primary"
              )}
            >
              <item.icon className={cn("size-4.5", compact && "size-3")} />
            </div>
            <div className="flex min-w-0 flex-col">
              <span className={cn("text-xs text-muted-foreground", compact && "text-[12.5px] leading-tight")}>
                {item.label}
              </span>
              <span
                className={cn(
                  "truncate font-semibold",
                  compact ? "text-[15px] leading-tight" : "text-lg",
                  item.mono && "font-mono"
                )}
              >
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
