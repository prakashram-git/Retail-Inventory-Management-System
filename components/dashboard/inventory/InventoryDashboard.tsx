"use client";

import { useMemo, useState } from "react";
import {
  Plus,
  Search,
  MoreVertical,
  Pencil,
  Trash2,
  Boxes,
  Wallet,
  TriangleAlert,
  PackageX,
  PackagePlus,
} from "lucide-react";
import { useStore } from "@/components/providers/StoreProvider";
import { getEffectiveThreshold, getStockStatus } from "@/lib/utils/inventory";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CategorySelect } from "./CategorySelect";
import {
  ProductThumbnail,
  CategoryBadge,
  MarginBadge,
  StockBar,
  StockStatusBadge,
} from "./ProductDisplay";
import { InventoryKpiGrid } from "./InventoryKpiGrid";
import { ProductSheet } from "./ProductSheet";
import { DeleteProductDialog } from "./DeleteProductDialog";
import { StockAdjustmentModal } from "./StockAdjustmentModal";
import { VarianceAlertBanner, type VarianceOrderSummary } from "./VarianceAlertBanner";
import type { Category, ProductWithCategory } from "@/lib/types/domain";

interface InventoryDashboardProps {
  products: ProductWithCategory[];
  categories: Category[];
  varianceOrders: VarianceOrderSummary[];
}

export function InventoryDashboard({ products, categories, varianceOrders }: InventoryDashboardProps) {
  const { formatPrice } = useStore();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [sheetState, setSheetState] = useState<{ open: boolean; product: ProductWithCategory | null }>(
    { open: false, product: null }
  );
  const [deleteTarget, setDeleteTarget] = useState<ProductWithCategory | null>(null);
  const [adjustTarget, setAdjustTarget] = useState<ProductWithCategory | null>(null);

  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const kpis = useMemo(() => {
    let valuation = 0;
    let low = 0;
    let out = 0;
    for (const product of products) {
      valuation += product.cost_price * product.current_stock;
      const threshold = getEffectiveThreshold(product, product.category && categoryById.get(product.category.id));
      const status = getStockStatus(product.current_stock, threshold);
      if (status === "low") low += 1;
      if (status === "out") out += 1;
    }
    return {
      totalSkus: products.length,
      valuation,
      low,
      out,
    };
  }, [products, categoryById]);

  const filteredProducts = useMemo(() => {
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

      if (lowStockOnly) {
        const threshold = getEffectiveThreshold(
          product,
          product.category && categoryById.get(product.category.id)
        );
        const status = getStockStatus(product.current_stock, threshold);
        if (status === "healthy") return false;
      }

      return true;
    });
  }, [products, search, categoryFilter, lowStockOnly, categoryById]);

  function openCreate() {
    setSheetState({ open: true, product: null });
  }

  function openEdit(product: ProductWithCategory) {
    setSheetState({ open: true, product });
  }

  return (
    <div className="flex flex-col gap-4">
      <VarianceAlertBanner orders={varianceOrders} />

      <InventoryKpiGrid
        items={[
          { label: "Total SKUs", value: String(kpis.totalSkus), icon: Boxes },
          { label: "Inventory valuation", value: formatPrice(kpis.valuation), icon: Wallet, mono: true },
          { label: "Low stock", value: String(kpis.low), icon: TriangleAlert, tone: "warning" },
          { label: "Out of stock", value: String(kpis.out), icon: PackageX, tone: "destructive" },
        ]}
      />

      <Card size="sm">
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
            <InputGroup className="sm:max-w-64">
              <InputGroupAddon>
                <Search />
              </InputGroupAddon>
              <InputGroupInput
                placeholder="Search SKU, name, or barcode"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </InputGroup>

            <div className="sm:w-56">
              <CategorySelect
                categories={categories}
                value={categoryFilter}
                onValueChange={setCategoryFilter}
                noneLabel="All categories"
                noneValue="all"
              />
            </div>

            <div className="flex items-center gap-2">
              <Switch id="low-stock-only" checked={lowStockOnly} onCheckedChange={setLowStockOnly} />
              <Label htmlFor="low-stock-only" className="whitespace-nowrap">
                Low stock only
              </Label>
            </div>
          </div>

          <Button onClick={openCreate} className="shrink-0">
            <Plus />
            New product
          </Button>
        </CardContent>
      </Card>

      {filteredProducts.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-12 text-center text-muted-foreground">
          <p className="text-sm">No products match these filters.</p>
        </div>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-xl border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead />
                  <TableHead>SKU</TableHead>
                  <TableHead>Barcode</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">Retail</TableHead>
                  <TableHead className="text-right">Margin</TableHead>
                  <TableHead>Stock</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProducts.map((product) => {
                  const threshold = getEffectiveThreshold(
                    product,
                    product.category && categoryById.get(product.category.id)
                  );
                  return (
                    <TableRow key={product.id} className={!product.is_active ? "opacity-60" : undefined}>
                      <TableCell>
                        <ProductThumbnail product={product} />
                      </TableCell>
                      <TableCell className="font-mono text-sm">{product.sku}</TableCell>
                      <TableCell className="font-mono text-sm text-muted-foreground">
                        {product.barcode || "—"}
                      </TableCell>
                      <TableCell className="max-w-48">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate">{product.name}</span>
                          {!product.is_active && (
                            <Badge variant="outline" className="shrink-0 text-xs">
                              Inactive
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <CategoryBadge category={product.category} />
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {formatPrice(product.cost_price)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {formatPrice(product.retail_price)}
                      </TableCell>
                      <TableCell className="text-right">
                        <MarginBadge costPrice={product.cost_price} retailPrice={product.retail_price} />
                      </TableCell>
                      <TableCell>
                        <StockBar currentStock={product.current_stock} threshold={threshold} />
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button variant="ghost" size="icon-sm">
                                <MoreVertical />
                                <span className="sr-only">Product actions</span>
                              </Button>
                            }
                          />
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => openEdit(product)}>
                              <Pencil />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => setAdjustTarget(product)}>
                              <PackagePlus />
                              Adjust stock
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              variant="destructive"
                              onSelect={() => setDeleteTarget(product)}
                            >
                              <Trash2 />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div className="grid gap-2 md:hidden">
            {filteredProducts.map((product) => {
              const threshold = getEffectiveThreshold(
                product,
                product.category && categoryById.get(product.category.id)
              );
              return (
                <Card key={product.id} size="sm" className={!product.is_active ? "opacity-60" : undefined}>
                  <CardContent className="flex gap-3">
                    <ProductThumbnail product={product} />
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex min-w-0 flex-col">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate text-sm font-medium">{product.name}</span>
                            {!product.is_active && (
                              <Badge variant="outline" className="shrink-0 text-xs">
                                Inactive
                              </Badge>
                            )}
                          </div>
                          <span className="font-mono text-xs text-muted-foreground">
                            {product.sku}
                          </span>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button variant="ghost" size="icon-sm" className="shrink-0">
                                <MoreVertical />
                                <span className="sr-only">Product actions</span>
                              </Button>
                            }
                          />
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => openEdit(product)}>
                              <Pencil />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => setAdjustTarget(product)}>
                              <PackagePlus />
                              Adjust stock
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              variant="destructive"
                              onSelect={() => setDeleteTarget(product)}
                            >
                              <Trash2 />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>

                      <div className="flex items-center gap-2">
                        <CategoryBadge category={product.category} />
                        <StockStatusBadge currentStock={product.current_stock} threshold={threshold} />
                      </div>

                      <div className="flex items-center justify-between text-sm">
                        <span className="font-mono">{formatPrice(product.retail_price)}</span>
                        <MarginBadge costPrice={product.cost_price} retailPrice={product.retail_price} />
                      </div>

                      <StockBar currentStock={product.current_stock} threshold={threshold} />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}

      <ProductSheet
        open={sheetState.open}
        onOpenChange={(open) => setSheetState((prev) => ({ ...prev, open }))}
        product={sheetState.product}
        categories={categories}
      />

      <DeleteProductDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        product={deleteTarget}
      />

      <StockAdjustmentModal
        open={!!adjustTarget}
        onOpenChange={(open) => !open && setAdjustTarget(null)}
        product={adjustTarget}
      />
    </div>
  );
}
