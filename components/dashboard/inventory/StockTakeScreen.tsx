"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Search, ScanLine, ClipboardCheck, CircleCheck, CircleAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { CategorySelect } from "./CategorySelect";
import { CameraBarcodeScanner } from "./CameraBarcodeScanner";
import { submitStockTake } from "@/lib/actions/inventory";
import type { Category, Product } from "@/lib/types/domain";

interface StockTakeScreenProps {
  products: Product[];
  categories: Category[];
}

export function StockTakeScreen({ products, categories }: StockTakeScreenProps) {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [scannerOpen, setScannerOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return products.filter((product) => {
      if (query) {
        const haystack = `${product.sku} ${product.name} ${product.barcode ?? ""}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      if (categoryFilter !== "all" && product.category_id !== categoryFilter) return false;
      return true;
    });
  }, [products, search, categoryFilter]);

  const countedIds = useMemo(
    () => Object.keys(counts).filter((id) => counts[id].trim() !== ""),
    [counts]
  );
  const varianceCount = useMemo(() => {
    let count = 0;
    for (const product of products) {
      const raw = counts[product.id];
      if (raw === undefined || raw.trim() === "") continue;
      const counted = Number(raw);
      if (Number.isFinite(counted) && counted !== product.current_stock) count += 1;
    }
    return count;
  }, [counts, products]);

  function handleScan(code: string) {
    setScannerOpen(false);
    const match = products.find(
      (p) => p.barcode === code || p.sku.toLowerCase() === code.toLowerCase()
    );
    if (match) {
      setSearch(match.sku);
      toast.success(`Found ${match.name}`);
    } else {
      toast.error(`No product matches barcode "${code}"`);
    }
  }

  function handleSave() {
    const entries = products
      .map((product) => {
        const raw = counts[product.id];
        if (raw === undefined || raw.trim() === "") return null;
        const counted_quantity = Number(raw);
        if (!Number.isFinite(counted_quantity) || counted_quantity < 0) return null;
        return { product_id: product.id, counted_quantity };
      })
      .filter((entry): entry is { product_id: string; counted_quantity: number } => entry !== null);

    if (entries.length === 0) {
      toast.error("Count at least one product before saving.");
      return;
    }

    startTransition(async () => {
      try {
        const result = await submitStockTake({ entries });
        toast.success(
          result.adjustedTotal > 0
            ? `Saved — ${result.adjustedTotal} of ${result.countedTotal} counted items had a variance`
            : `Saved — all ${result.countedTotal} counted items matched system stock`
        );
        setCounts({});
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to save stock take");
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Stock take</h1>
          <p className="text-sm text-muted-foreground">
            Enter the counted quantity for each product — the system shows the variance automatically.
          </p>
        </div>
      </div>

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
          </div>
          <Button variant="outline" onClick={() => setScannerOpen(true)} className="shrink-0">
            <ScanLine />
            Scan barcode
          </Button>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/30 px-4 py-3 text-sm">
        <span className="flex items-center gap-1.5 font-medium">
          <ClipboardCheck className="size-4 text-primary" />
          {countedIds.length} counted
        </span>
        <span className="flex items-center gap-1.5 text-muted-foreground">
          {varianceCount > 0 ? (
            <CircleAlert className="size-4 text-amber-600 dark:text-amber-400" />
          ) : (
            <CircleCheck className="size-4 text-emerald-600 dark:text-emerald-400" />
          )}
          {varianceCount} {varianceCount === 1 ? "variance" : "variances"}
        </span>
        <div className="ml-auto">
          <Button onClick={handleSave} disabled={isPending || countedIds.length === 0}>
            {isPending ? "Saving..." : "Save stock take"}
          </Button>
        </div>
      </div>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Products ({filteredProducts.length})</CardTitle>
          <CardDescription>Counted quantity vs. system stock</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col divide-y">
          {filteredProducts.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No products match these filters.</p>
          ) : (
            filteredProducts.map((product) => {
              const raw = counts[product.id] ?? "";
              const counted = raw.trim() === "" ? null : Number(raw);
              const hasCount = counted !== null && Number.isFinite(counted);
              const variance = hasCount ? counted! - product.current_stock : null;

              return (
                <div key={product.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium">{product.name}</span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {product.sku} · system: {product.current_stock}
                    </span>
                  </div>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    placeholder="Count"
                    value={raw}
                    onChange={(e) =>
                      setCounts((prev) => ({ ...prev, [product.id]: e.target.value }))
                    }
                    className="w-24 text-right"
                  />
                  <div className="w-28 shrink-0 text-right">
                    {variance === null ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : variance === 0 ? (
                      <Badge variant="outline" className="text-xs">Matches</Badge>
                    ) : (
                      <Badge variant={variance > 0 ? "secondary" : "destructive"} className="text-xs">
                        {variance > 0 ? `+${variance}` : variance}
                      </Badge>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <CameraBarcodeScanner open={scannerOpen} onOpenChange={setScannerOpen} onDetect={handleScan} />
    </div>
  );
}
