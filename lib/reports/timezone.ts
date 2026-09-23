export type ReportRangePreset = "today" | "7d" | "30d" | "ytd";

export const REPORT_RANGE_PRESETS: { value: ReportRangePreset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7D" },
  { value: "30d", label: "30D" },
  { value: "ytd", label: "YTD" },
];

function offsetMinutesAt(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
    .formatToParts(date)
    .reduce<Record<string, string>>((acc, part) => {
      acc[part.type] = part.value;
      return acc;
    }, {});

  // Formatting `date` *as if it were UTC* in the target zone gives back the
  // local wall-clock time; the gap between that and the real UTC instant is
  // the zone's current offset, without needing a timezone database library.
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    parts.hour === "24" ? 0 : Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return (asUtc - date.getTime()) / 60_000;
}

/** Midnight of `date`'s calendar day *in `timeZone`*, returned as a UTC instant. */
export function startOfLocalDay(date: Date, timeZone: string): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(date)
    .reduce<Record<string, string>>((acc, part) => {
      acc[part.type] = part.value;
      return acc;
    }, {});

  const naiveUtcMidnight = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
  const offsetMinutes = offsetMinutesAt(new Date(naiveUtcMidnight), timeZone);
  return new Date(naiveUtcMidnight - offsetMinutes * 60_000);
}

/** The 0-23 hour this UTC instant falls in when viewed in `timeZone`. */
export function localHour(date: Date, timeZone: string): number {
  const hour = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    hour12: false,
  }).format(date);
  const parsed = Number(hour);
  return parsed === 24 ? 0 : parsed;
}

/** The YYYY-MM-DD this UTC instant falls on when viewed in `timeZone`. */
export function localDateKey(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(date);
}

export function getRangeBounds(
  preset: ReportRangePreset,
  timeZone: string,
  now: Date = new Date()
): { from: Date; to: Date } {
  const todayStart = startOfLocalDay(now, timeZone);

  switch (preset) {
    case "today":
      return { from: todayStart, to: now };
    case "7d":
      return { from: new Date(todayStart.getTime() - 6 * 86_400_000), to: now };
    case "30d":
      return { from: new Date(todayStart.getTime() - 29 * 86_400_000), to: now };
    case "ytd": {
      const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric" }).formatToParts(now);
      const year = Number(parts.find((p) => p.type === "year")?.value);
      const jan1 = new Date(Date.UTC(year, 0, 1));
      return { from: startOfLocalDay(jan1, timeZone), to: now };
    }
  }
}
