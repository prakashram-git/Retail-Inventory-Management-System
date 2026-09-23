"use client";

import { MoreVertical, Pencil, Trash2, Percent } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getCategoryIcon } from "@/lib/utils/category-icons";
import { cn } from "@/lib/utils";
import type { CategoryWithCount } from "@/lib/types/domain";

interface CategoryCardProps {
  category: CategoryWithCount;
  variant?: "parent" | "child";
  onEdit: () => void;
  onDelete: () => void;
}

export function CategoryCard({
  category,
  variant = "parent",
  onEdit,
  onDelete,
}: CategoryCardProps) {
  const Icon = getCategoryIcon(category.icon);

  return (
    <Card size="sm" className={cn(variant === "child" && "bg-muted/30")}>
      <CardContent className="flex items-start gap-3">
        <div
          className={cn(
            "flex shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary",
            variant === "parent" ? "size-10" : "size-8"
          )}
        >
          {/* Icon is looked up from a static map, not defined here, but the
              linter's heuristic can't tell the two apart from a capitalized
              local binding. */}
          {/* eslint-disable-next-line react-hooks/static-components */}
          <Icon className={variant === "parent" ? "size-5" : "size-4"} />
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "truncate font-medium",
                variant === "parent" ? "text-base" : "text-sm"
              )}
            >
              {category.name}
            </span>
            {category.is_tax_exempt && (
              <Badge variant="outline" className="gap-1 text-xs">
                <Percent className="size-3" />
                Tax exempt
              </Badge>
            )}
          </div>
          <code className="text-xs text-muted-foreground">/{category.slug}</code>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary">
              {category.product_count} {category.product_count === 1 ? "product" : "products"}
            </Badge>
            <Badge variant="outline">Low-stock at {category.default_min_threshold}</Badge>
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="icon-sm" className="shrink-0">
                <MoreVertical />
                <span className="sr-only">Category actions</span>
              </Button>
            }
          />
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onEdit}>
              <Pencil />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={onDelete}>
              <Trash2 />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardContent>
    </Card>
  );
}
