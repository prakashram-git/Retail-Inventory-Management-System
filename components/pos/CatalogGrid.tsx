"use client";

import { useMemo, useState } from "react";
import { Search, LayoutGrid } from "lucide-react";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getCategoryIcon } from "@/lib/utils/category-icons";
import { ProductCard } from "./ProductCard";
import type { PosCategory, PosProduct } from "@/lib/pos/types";

interface CatalogGridProps {
  products: PosProduct[];
  categories: PosCategory[];
  onAdd: (product: PosProduct) => void;
  onInspectSisterStores: (product: PosProduct) => void;
}

export function CatalogGrid({ products, categories, onAdd, onInspectSisterStores }: CatalogGridProps) {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const topLevelCategories = useMemo(() => categories.filter((c) => !c.parent_id), [categories]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return products.filter((product) => {
      if (query) {
        const haystack = `${product.sku} ${product.name} ${product.barcode ?? ""}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      if (categoryFilter !== "all") {
        const matchesDirect = product.category_id === categoryFilter;
        const matchesParent = product.category?.parent_id === categoryFilter;
        if (!matchesDirect && !matchesParent) return false;
      }
      return true;
    });
  }, [products, search, categoryFilter]);

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex flex-col gap-2">
        <InputGroup>
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            placeholder="Search or scan SKU, name, barcode"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </InputGroup>

        <div className="flex gap-1.5 overflow-x-auto pb-1">
          <Button
            variant={categoryFilter === "all" ? "secondary" : "outline"}
            size="sm"
            className="shrink-0 gap-1.5"
            onClick={() => setCategoryFilter("all")}
          >
            <LayoutGrid className="size-4" />
            All
          </Button>
          {topLevelCategories.map((category) => {
            const Icon = getCategoryIcon(category.icon);
            return (
              <Button
                key={category.id}
                variant={categoryFilter === category.id ? "secondary" : "outline"}
                size="sm"
                className={cn("shrink-0 gap-1.5")}
                onClick={() => setCategoryFilter(category.id)}
              >
                <Icon className="size-4" />
                {category.name}
              </Button>
            );
          })}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-1 items-center justify-center py-16 text-center text-sm text-muted-foreground">
          No products match this search.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 overflow-y-auto pb-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-3">
          {filtered.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              onAdd={() => onAdd(product)}
              onInspectSisterStores={() => onInspectSisterStores(product)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
