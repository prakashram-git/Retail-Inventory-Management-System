"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
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
  ClipboardCheck,
  Upload,
  Download,
} from "lucide-react";
import { toast } from "sonner";
import { useStore } from "@/components/providers/StoreProvider";
import { cn } from "@/lib/utils";
import { getEffectiveThreshold, getStockStatus } from "@/lib/utils/inventory";
import { exportToCsv } from "@/lib/reports/exporter";
import type { ReportColumn } from "@/lib/reports/catalog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
import { BulkDeleteProductsDialog } from "./BulkDeleteProductsDialog";
import { StockAdjustmentModal } from "./StockAdjustmentModal";
import { ImportProductsDialog } from "./ImportProductsDialog";
import { VarianceAlertBanner, type VarianceOrderSummary } from "./VarianceAlertBanner";
import type { Category, ProductWithCategory } from "@/lib/types/domain";

interface InventoryDashboardProps {
  products: ProductWithCategory[];
  categories: Category[];
  varianceOrders: VarianceOrderSummary[];
}

/** Mirrors PRODUCT_CSV_COLUMNS (lib/products/csvSchema.ts) so an export can be
 * edited and re-imported through the same Import CSV flow. */
const PRODUCT_EXPORT_COLUMNS: ReportColumn[] = [
  { key: "name", label: "name", type: "string" },
  { key: "sku", label: "sku", type: "string" },
  { key: "barcode", label: "barcode", type: "string" },
  { key: "category_name", label: "category_name", type: "string" },
  { key: "tags", label: "tags", type: "string" },
  { key: "description", label: "description", type: "string" },
  { key: "cost_price", label: "cost_price", type: "number" },
  { key: "retail_price", label: "retail_price", type: "number" },
  { key: "current_stock", label: "current_stock", type: "number" },
  { key: "min_threshold", label: "min_threshold", type: "number" },
  { key: "image_url", label: "image_url", type: "string" },
  { key: "is_active", label: "is_active", type: "string" },
];

function exportProductsCsv(products: ProductWithCategory[]) {
  const rows = products.map((p) => ({
    name: p.name,
    sku: p.sku,
    barcode: p.barcode ?? "",
    category_name: p.category?.name ?? "",
    tags: (p.tags ?? []).join(";"),
    description: p.description ?? "",
    cost_price: p.cost_price,
    retail_price: p.retail_price,
    current_stock: p.current_stock,
    min_threshold: p.min_threshold ?? "",
    image_url: p.image_url ?? "",
    is_active: p.is_active ? "true" : "false",
  }));
  const stamp = new Date().toISOString().slice(0, 10);
  exportToCsv(PRODUCT_EXPORT_COLUMNS, rows, `products-export-${stamp}.csv`);
}

export function InventoryDashboard({ products, categories, varianceOrders }: InventoryDashboardProps) {
  const { formatPrice } = useStore();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [sheetState, setSheetState] = useState<{ open: boolean; product: ProductWithCategory | null }>(
    { open: false, product: null }
  );
  const [deleteTarget, setDeleteTarget] = useState<ProductWithCategory | null>(null);
  const [adjustTarget, setAdjustTarget] = useState<ProductWithCategory | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

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
      if (!showInactive && !product.is_active) return false;

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
  }, [products, search, categoryFilter, lowStockOnly, showInactive, categoryById]);

  function openCreate() {
    setSheetState({ open: true, product: null });
  }

  function openEdit(product: ProductWithCategory) {
    setSheetState({ open: true, product });
  }

  const selectedProducts = useMemo(
    () => filteredProducts.filter((p) => selectedIds.has(p.id)),
    [filteredProducts, selectedIds]
  );
  const allVisibleSelected =
    filteredProducts.length > 0 && filteredProducts.every((p) => selectedIds.has(p.id));
  const someVisibleSelected = filteredProducts.some((p) => selectedIds.has(p.id));

  function toggleSelectAll(checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const p of filteredProducts) {
        if (checked) next.add(p.id);
        else next.delete(p.id);
      }
      return next;
    });
  }

  function toggleRow(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  return (
    <div className="flex flex-col gap-4">
      <VarianceAlertBanner orders={varianceOrders} />

      <InventoryKpiGrid
        compact
        items={[
          { label: "Total SKUs", value: String(kpis.totalSkus), icon: Boxes },
          { label: "Inventory valuation", value: formatPrice(kpis.valuation), icon: Wallet, mono: true },
          { label: "Low stock", value: String(kpis.low), icon: TriangleAlert, tone: "warning" },
          { label: "Out of stock", value: String(kpis.out), icon: PackageX, tone: "destructive" },
        ]}
      />

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <div className="col-span-2 flex items-center gap-2">
          <InputGroup className="h-7 w-full min-w-0 sm:max-w-[182px] sm:flex-1">
            <InputGroupAddon>
              <Search className="size-3.5" />
            </InputGroupAddon>
            <InputGroupInput
              placeholder="Search SKU..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="text-xs"
            />
          </InputGroup>

          <div className="w-full min-w-0 sm:max-w-[182px] sm:flex-1">
            <CategorySelect
              categories={categories}
              value={categoryFilter}
              onValueChange={setCategoryFilter}
              noneLabel="All categories"
              noneValue="all"
              size="sm"
            />
          </div>
        </div>

        <div className="col-span-2 flex flex-wrap items-center justify-center gap-2 rounded-lg border border-border p-1.5">
          <div className="flex items-center gap-1.5">
            <Switch id="low-stock-only" checked={lowStockOnly} onCheckedChange={setLowStockOnly} />
            <Label htmlFor="low-stock-only" className="whitespace-nowrap text-xs">
              Low stock
            </Label>
          </div>

          <div className="flex items-center gap-1.5">
            <Switch id="show-inactive" checked={showInactive} onCheckedChange={setShowInactive} />
            <Label htmlFor="show-inactive" className="whitespace-nowrap text-xs">
              Deleted
            </Label>
          </div>

          <Button
            size="sm"
            variant="outline"
            nativeButton={false}
            render={<Link href="/dashboard/inventory/stock-take" />}
          >
            <ClipboardCheck />
            Stock take
          </Button>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button size="icon-sm" variant="outline" onClick={() => setImportOpen(true)}>
                  <Upload />
                  <span className="sr-only">Import CSV</span>
                </Button>
              }
            />
            <TooltipContent>Import CSV</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="icon-sm"
                  variant="outline"
                  disabled={filteredProducts.length === 0}
                  onClick={() => {
                    exportProductsCsv(filteredProducts);
                    toast.success(`Exported ${filteredProducts.length} product${filteredProducts.length === 1 ? "" : "s"}`);
                  }}
                >
                  <Download />
                  <span className="sr-only">Export</span>
                </Button>
              }
            />
            <TooltipContent>Export</TooltipContent>
          </Tooltip>
          <Button size="sm" onClick={openCreate}>
            <Plus />
            New product
          </Button>
        </div>
      </div>

      {selectedProducts.length > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 p-1.5">
          <span className="px-1.5 text-xs font-medium">
            {selectedProducts.length} selected
          </span>
          <Button size="sm" variant="outline" onClick={clearSelection}>
            Clear selection
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="ml-auto"
            onClick={() => {
              exportProductsCsv(selectedProducts);
              toast.success(`Exported ${selectedProducts.length} product${selectedProducts.length === 1 ? "" : "s"}`);
            }}
          >
            <Download />
            Export selected
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => setBulkDeleteOpen(true)}
          >
            <Trash2 />
            Delete selected
          </Button>
        </div>
      )}

      {filteredProducts.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-12 text-center text-muted-foreground">
          <p className="text-sm">No products match these filters.</p>
        </div>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-xl border md:block">
            <Table className="text-xs [&_td]:p-1.5 [&_th]:h-8 [&_th]:px-1.5">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8 text-center">
                    <Checkbox
                      checked={allVisibleSelected}
                      indeterminate={!allVisibleSelected && someVisibleSelected}
                      onCheckedChange={toggleSelectAll}
                      aria-label="Select all visible products"
                    />
                  </TableHead>
                  <TableHead />
                  <TableHead className="text-center">SKU</TableHead>
                  <TableHead className="text-center">Barcode</TableHead>
                  <TableHead className="text-center">Title</TableHead>
                  <TableHead className="text-center">Category</TableHead>
                  <TableHead className="text-center">Cost</TableHead>
                  <TableHead className="pl-6 text-center">Retail</TableHead>
                  <TableHead className="text-center">Margin</TableHead>
                  <TableHead className="text-center">Stock</TableHead>
                  <TableHead className="sticky right-0 z-10 border-l bg-background" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProducts.map((product, index) => {
                  const threshold = getEffectiveThreshold(
                    product,
                    product.category && categoryById.get(product.category.id)
                  );
                  return (
                    <TableRow
                      key={product.id}
                      className={cn(
                        index % 2 === 1 && "bg-muted/40",
                        !product.is_active && "opacity-60"
                      )}
                    >
                      <TableCell className="text-center">
                        <Checkbox
                          checked={selectedIds.has(product.id)}
                          onCheckedChange={(checked) => toggleRow(product.id, checked)}
                          aria-label={`Select ${product.name}`}
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <ProductThumbnail product={product} size="sm" />
                      </TableCell>
                      <TableCell className="text-left font-mono text-xs">{product.sku}</TableCell>
                      <TableCell className="max-w-20 truncate text-center font-mono text-xs text-muted-foreground">
                        {product.barcode || "—"}
                      </TableCell>
                      <TableCell className="max-w-24">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-xs">{product.name}</span>
                          {!product.is_active && (
                            <Badge variant="outline" className="shrink-0 text-xs">
                              Inactive
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-20">
                        <CategoryBadge category={product.category} />
                      </TableCell>
                      <TableCell className="text-center font-mono text-xs">
                        {formatPrice(product.cost_price)}
                      </TableCell>
                      <TableCell className="pl-6 text-center font-mono text-xs">
                        {formatPrice(product.retail_price)}
                      </TableCell>
                      <TableCell className="text-center">
                        <MarginBadge costPrice={product.cost_price} retailPrice={product.retail_price} />
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-center">
                          <StockBar currentStock={product.current_stock} threshold={threshold} />
                        </div>
                      </TableCell>
                      <TableCell className="sticky right-0 z-10 border-l bg-background">
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
                            <DropdownMenuItem onClick={() => openEdit(product)}>
                              <Pencil />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setAdjustTarget(product)}>
                              <PackagePlus />
                              Adjust stock
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => setDeleteTarget(product)}
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
                            <span className="truncate text-xs font-medium">{product.name}</span>
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
                            <DropdownMenuItem onClick={() => openEdit(product)}>
                              <Pencil />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setAdjustTarget(product)}>
                              <PackagePlus />
                              Adjust stock
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => setDeleteTarget(product)}
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

                      <div className="flex items-center justify-between text-xs">
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

      <ImportProductsDialog open={importOpen} onOpenChange={setImportOpen} />

      <BulkDeleteProductsDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        products={selectedProducts}
        onDeleted={clearSelection}
      />
    </div>
  );
}
