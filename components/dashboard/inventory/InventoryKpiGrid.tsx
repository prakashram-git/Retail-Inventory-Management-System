"use client";

import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface KpiItem {
  label: string;
  value: string;
  icon: LucideIcon;
  tone?: "default" | "warning" | "destructive";
  mono?: boolean;
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
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
