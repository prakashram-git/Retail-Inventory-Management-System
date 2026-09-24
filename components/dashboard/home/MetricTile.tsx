"use client";

import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface MetricTileProps {
  label: string;
  value: string;
  icon: LucideIcon;
  tone?: "default" | "warning" | "destructive" | "success" | "info" | "accent";
  mono?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * A single configurable KPI tile — the layout-builder-driven counterpart to
 * InventoryKpiGrid's fixed 4-up grid (kept separate so the Inventory page's
 * own KPI row, which isn't customizable, is unaffected by dashboard theming).
 */
export function MetricTile({ label, value, icon: Icon, tone, mono, className, style }: MetricTileProps) {
  return (
    <Card
      size="sm"
      className={cn("h-full transition-shadow hover:shadow-md data-[size=sm]:[--card-spacing:--spacing(1.5)]", className)}
      style={style}
    >
      <CardContent className="flex items-center gap-2">
        <div
          className={cn(
            "flex size-6 shrink-0 items-center justify-center rounded-md",
            tone === "destructive" && "bg-destructive/10 text-destructive",
            tone === "warning" && "bg-amber-500/10 text-amber-600 dark:text-amber-400",
            tone === "success" && "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
            tone === "info" && "bg-sky-500/10 text-sky-600 dark:text-sky-400",
            tone === "accent" && "bg-violet-500/10 text-violet-600 dark:text-violet-400",
            (!tone || tone === "default") && "bg-primary/10 text-primary"
          )}
        >
          <Icon className="size-3.5" />
        </div>
        <div className="flex min-w-0 flex-col leading-tight">
          <span className="truncate text-[10px] text-muted-foreground">{label}</span>
          <span className={cn("truncate text-sm font-semibold", mono && "font-mono")}>{value}</span>
        </div>
      </CardContent>
    </Card>
  );
}
