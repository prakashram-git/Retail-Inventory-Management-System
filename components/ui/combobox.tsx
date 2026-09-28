"use client";

import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";

export interface ComboboxOption {
  value: string;
  label: string;
  /** Extra text searched but not necessarily shown, e.g. a currency's full name alongside its code. */
  keywords?: string[];
}

interface ComboboxProps {
  options: ComboboxOption[];
  value: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  id?: string;
  renderOption?: (option: ComboboxOption) => React.ReactNode;
  renderValue?: (option: ComboboxOption) => React.ReactNode;
}

/**
 * A searchable single-select — Select's native <select>-style dropdown
 * doesn't scale past a couple dozen options (currency/timezone lists here
 * run into the hundreds), so this pairs Popover with the cmdk-backed
 * Command component instead. Generic over any {value, label} list.
 */
export function Combobox({
  options,
  value,
  onChange,
  placeholder = "Select...",
  searchPlaceholder = "Search...",
  emptyText = "No results.",
  disabled,
  id,
  renderOption,
  renderValue,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value) ?? null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            id={id}
            type="button"
            variant="outline"
            disabled={disabled}
            className="w-full justify-between font-normal"
          >
            <span className={cn("truncate", !selected && "text-muted-foreground")}>
              {selected ? (renderValue ? renderValue(selected) : selected.label) : placeholder}
            </span>
            <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
          </Button>
        }
      />
      <PopoverContent className="w-[--anchor-width] p-0" align="start">
        <Command
          filter={(itemValue, search) => {
            const option = options.find((o) => o.value === itemValue);
            if (!option) return 0;
            const haystack = [option.value, option.label, ...(option.keywords ?? [])]
              .join(" ")
              .toLowerCase();
            return haystack.includes(search.toLowerCase()) ? 1 : 0;
          }}
        >
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.value}
                  onSelect={(next) => {
                    onChange(next);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn("size-4", option.value === value ? "opacity-100" : "opacity-0")}
                  />
                  {renderOption ? renderOption(option) : option.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
