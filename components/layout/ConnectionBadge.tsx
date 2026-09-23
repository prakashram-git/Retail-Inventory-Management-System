"use client";

import { useSync } from "@/components/providers/SyncProvider";
import { Badge } from "@/components/ui/badge";

export function ConnectionBadge() {
  const { isOnline } = useSync();

  return (
    <Badge
      variant="outline"
      className={
        isOnline
          ? "gap-1.5 border-emerald-300 text-emerald-700 dark:border-emerald-800 dark:text-emerald-400"
          : "gap-1.5 border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-400"
      }
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          isOnline ? "bg-emerald-500" : "bg-amber-500"
        }`}
      />
      {isOnline ? "Online" : "Offline Local"}
    </Badge>
  );
}
