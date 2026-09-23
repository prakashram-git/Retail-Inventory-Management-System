"use client";

import { useState } from "react";
import { CalendarRange } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";

interface CustomDateRangePickerProps {
  active: boolean;
  /** The currently-applied custom bounds, to prefill the inputs on reopen. */
  from: string | null;
  to: string | null;
  onApply: (from: string, to: string) => void;
}

const today = () => new Date().toISOString().slice(0, 10);

export function CustomDateRangePicker({ active, from, to, onApply }: CustomDateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState(from ?? today());
  const [draftTo, setDraftTo] = useState(to ?? today());

  function handleOpenChange(next: boolean) {
    if (next) {
      setDraftFrom(from ?? today());
      setDraftTo(to ?? today());
    }
    setOpen(next);
  }

  function apply() {
    if (draftFrom > draftTo) return;
    onApply(draftFrom, draftTo);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        render={
          <Button type="button" size="sm" variant={active ? "secondary" : "outline"} className="shrink-0">
            <CalendarRange />
            {active && from && to ? `${from} → ${to}` : "Custom"}
          </Button>
        }
      />
      <PopoverContent className="w-auto">
        <PopoverHeader>
          <PopoverTitle>Custom range</PopoverTitle>
        </PopoverHeader>
        <div className="flex items-end gap-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor="range-from" className="text-xs">
              From
            </Label>
            <Input
              id="range-from"
              type="date"
              value={draftFrom}
              max={draftTo}
              onChange={(e) => setDraftFrom(e.target.value)}
              className="w-36"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="range-to" className="text-xs">
              To
            </Label>
            <Input
              id="range-to"
              type="date"
              value={draftTo}
              min={draftFrom}
              max={today()}
              onChange={(e) => setDraftTo(e.target.value)}
              className="w-36"
            />
          </div>
        </div>
        <Button type="button" size="sm" onClick={apply} disabled={draftFrom > draftTo}>
          Apply
        </Button>
      </PopoverContent>
    </Popover>
  );
}
