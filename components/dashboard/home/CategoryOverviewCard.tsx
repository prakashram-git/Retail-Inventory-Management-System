"use client";

import Link from "next/link";
import { FolderTree, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getCategoryIcon } from "@/lib/utils/category-icons";
import type { Category } from "@/lib/types/domain";

interface CategorySummary {
  category: Category;
  productCount: number;
}

export function CategoryOverviewCard({ categories, productCountById }: {
  categories: Category[];
  productCountById: Map<string, number>;
}) {
  const rows: CategorySummary[] = categories
    .filter((c) => !c.parent_id)
    .map((category) => ({ category, productCount: productCountById.get(category.id) ?? 0 }))
    .sort((a, b) => b.productCount - a.productCount)
    .slice(0, 6);

  return (
    <Card size="sm" className="flex flex-col transition-shadow hover:shadow-md">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Categories</CardTitle>
        <Button
          variant="ghost"
          size="sm"
          nativeButton={false}
          render={<Link href="/dashboard/categories">Manage</Link>}
        />
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center text-muted-foreground">
            <FolderTree className="size-6" />
            <p className="text-sm">No categories yet.</p>
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link href="/dashboard/categories">Create your first category</Link>}
            />
          </div>
        ) : (
          rows.map(({ category, productCount }) => {
            const Icon = getCategoryIcon(category.icon);
            return (
              <Link
                key={category.id}
                href="/dashboard/categories"
                className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/50"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="size-4" />
                  </div>
                  <span className="truncate text-sm font-medium">{category.name}</span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant="secondary" className="text-xs">
                    {productCount} {productCount === 1 ? "product" : "products"}
                  </Badge>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </div>
              </Link>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
