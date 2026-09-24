import { startOfLocalDay } from "./timezone";

export type BuilderRangePreset = "today" | "yesterday" | "this_week" | "mtd" | "last_month" | "ytd" | "custom";

export const BUILDER_RANGE_PRESETS: { value: BuilderRangePreset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "this_week", label: "This Week" },
  { value: "mtd", label: "Month-to-Date" },
  { value: "last_month", label: "Last Month" },
  { value: "ytd", label: "Year-to-Date" },
  { value: "custom", label: "Custom Range" },
];

/** Report Builder-specific presets — kept separate from lib/reports/timezone.ts's
 * getRangeBounds() (today/7d/30d/ytd/custom) so that widely-used function's
 * behavior and callers stay untouched. */
export function getBuilderRangeBounds(
  preset: BuilderRangePreset,
  timezone: string,
  now: Date = new Date()
): { from: Date; to: Date } {
  const todayStart = startOfLocalDay(now, timezone);

  switch (preset) {
    case "today":
      return { from: todayStart, to: now };
    case "yesterday": {
      const yesterdayStart = new Date(todayStart.getTime() - 86_400_000);
      return { from: yesterdayStart, to: new Date(todayStart.getTime() - 1) };
    }
    case "this_week": {
      const dayOfWeek = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short" }).format(now);
      const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const offset = days.indexOf(dayOfWeek);
      const weekStart = new Date(todayStart.getTime() - offset * 86_400_000);
      return { from: weekStart, to: now };
    }
    case "mtd": {
      const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit" })
        .formatToParts(now)
        .reduce<Record<string, string>>((acc, p) => ({ ...acc, [p.type]: p.value }), {});
      const monthStart = startOfLocalDay(new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, 1, 12)), timezone);
      return { from: monthStart, to: now };
    }
    case "last_month": {
      const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit" })
        .formatToParts(now)
        .reduce<Record<string, string>>((acc, p) => ({ ...acc, [p.type]: p.value }), {});
      const year = Number(parts.year);
      const month = Number(parts.month) - 1; // 0-indexed current month
      const lastMonthDate = new Date(Date.UTC(year, month - 1, 1, 12));
      const from = startOfLocalDay(lastMonthDate, timezone);
      const to = new Date(startOfLocalDay(new Date(Date.UTC(year, month, 1, 12)), timezone).getTime() - 1);
      return { from, to };
    }
    case "ytd": {
      const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric" }).formatToParts(now);
      const year = Number(parts.find((p) => p.type === "year")?.value);
      const jan1 = new Date(Date.UTC(year, 0, 1, 12));
      return { from: startOfLocalDay(jan1, timezone), to: now };
    }
    case "custom":
      return { from: todayStart, to: now };
  }
}
