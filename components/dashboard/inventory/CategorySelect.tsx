"use client";

import { useMemo } from "react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
/** Structural subset of Category — lets other features (e.g. reports) reuse this without depending on the full domain type. */
export interface SelectableCategory {
  id: string;
  name: string;
  parent_id: string | null;
}

interface CategorySelectProps {
  categories: SelectableCategory[];
  value: string;
  onValueChange: (value: string) => void;
  /** The sentinel item shown above the hierarchy, e.g. "All categories" or "Uncategorized". */
  noneLabel: string;
  noneValue?: string;
  disabled?: boolean;
}

/** A grouped dropdown that lets a value be picked at either the parent or subcategory level. */
export function CategorySelect({
  categories,
  value,
  onValueChange,
  noneLabel,
  noneValue = "none",
  disabled,
}: CategorySelectProps) {
  const topLevel = useMemo(() => categories.filter((c) => !c.parent_id), [categories]);
  const childrenByParent = useMemo(() => {
    const map = new Map<string, SelectableCategory[]>();
    for (const category of categories) {
      if (!category.parent_id) continue;
      const list = map.get(category.parent_id) ?? [];
      list.push(category);
      map.set(category.parent_id, list);
    }
    return map;
  }, [categories]);

  return (
    <Select
      value={value}
      onValueChange={(next) => onValueChange(next ?? noneValue)}
      disabled={disabled}
    >
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={noneValue}>{noneLabel}</SelectItem>
        {topLevel.map((parent) => {
          const children = childrenByParent.get(parent.id) ?? [];
          return (
            <SelectGroup key={parent.id}>
              <SelectLabel>{parent.name}</SelectLabel>
              <SelectItem value={parent.id}>All {parent.name}</SelectItem>
              {children.map((child) => (
                <SelectItem key={child.id} value={child.id} className="pl-6">
                  {child.name}
                </SelectItem>
              ))}
            </SelectGroup>
          );
        })}
      </SelectContent>
    </Select>
  );
}
