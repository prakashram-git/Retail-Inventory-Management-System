"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface TimeRangePickerProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  presets: { value: T; label: string }[];
}

/** A single row of date-range presets, above whatever content it scopes. */
export function TimeRangePicker<T extends string>({
  value,
  onChange,
  presets,
}: TimeRangePickerProps<T>) {
  return (
    <div className="flex gap-1.5" role="group" aria-label="Date range">
      {presets.map((preset) => (
        <Button
          key={preset.value}
          type="button"
          size="sm"
          variant={value === preset.value ? "secondary" : "outline"}
          className={cn("shrink-0")}
          onClick={() => onChange(preset.value)}
        >
          {preset.label}
        </Button>
      ))}
    </div>
  );
}
