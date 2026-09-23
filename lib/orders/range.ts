import { startOfLocalDay } from "@/lib/reports/timezone";

export type OrdersRangePreset = "today" | "7d" | "30d" | "90d" | "all";

export const ORDERS_RANGE_PRESETS: { value: OrdersRangePreset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7D" },
  { value: "30d", label: "30D" },
  { value: "90d", label: "90D" },
  { value: "all", label: "All" },
];

export function getOrdersRangeBounds(
  preset: OrdersRangePreset,
  timeZone: string,
  now: Date = new Date()
): { from: Date | null; to: Date } {
  if (preset === "all") return { from: null, to: now };

  const todayStart = startOfLocalDay(now, timeZone);
  const daysBack = { today: 0, "7d": 6, "30d": 29, "90d": 89 }[preset];
  return { from: new Date(todayStart.getTime() - daysBack * 86_400_000), to: now };
}
