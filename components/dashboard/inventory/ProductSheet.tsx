"use client";

import { useEffect, useRef, useState, useTransition, type KeyboardEvent } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { X, ImagePlus, Loader2, Wand2, Keyboard, ScanBarcode, Camera, CheckCircle2, AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  checkProductIdentifiers,
  createProduct,
  createProductWithVariants,
  generateProductSku,
  updateProduct,
} from "@/lib/actions/products";
import { variantSku, type VariantRow } from "@/lib/products/variants";
import { validateGs1Barcode } from "@/lib/utils/gs1Validator";
import { useScannerBurst } from "@/lib/pos/use-scanner-burst";
import { cn } from "@/lib/utils";
import { productFormSchema, type ProductFormInput } from "@/lib/products/schema";
import { useStore } from "@/components/providers/StoreProvider";
import { computeMarginPercent } from "@/lib/utils/inventory";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { CategorySelect } from "./CategorySelect";
import { VariantMatrixBuilder } from "./VariantMatrixBuilder";
import { CameraBarcodeScanner } from "./CameraBarcodeScanner";
import type { Category, ProductWithCategory } from "@/lib/types/domain";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

type SkuMode = "auto" | "manual" | "scan";
const SKU_MODES: { value: SkuMode; label: string; icon: typeof Wand2 }[] = [
  { value: "auto", label: "Automated Taxonomy Mask", icon: Wand2 },
  { value: "manual", label: "Manual Semantic Entry", icon: Keyboard },
  { value: "scan", label: "Scan Barcode", icon: ScanBarcode },
];

interface ProductSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: ProductWithCategory | null;
  categories: Category[];
}

function defaultsFor(product: ProductWithCategory | null): ProductFormInput {
  return {
    name: product?.name ?? "",
    sku: product?.sku ?? "",
    barcode: product?.barcode ?? null,
    category_id: product?.category_id ?? null,
    tags: product?.tags ?? [],
    description: product?.description ?? null,
    cost_price: product?.cost_price ?? 0,
    retail_price: product?.retail_price ?? 0,
    current_stock: product?.current_stock ?? 0,
    min_threshold: product?.min_threshold ?? null,
    image_url: product?.image_url ?? null,
    is_active: product?.is_active ?? true,
  };
}

export function ProductSheet({ open, onOpenChange, product, categories }: ProductSheetProps) {
  const { storeId, formatPrice } = useStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [tagInput, setTagInput] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [skuMode, setSkuMode] = useState<SkuMode>("auto");
  const [skuPrefix, setSkuPrefix] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [idStatus, setIdStatus] = useState<{ skuTaken: boolean; barcodeTaken: boolean } | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [hasVariants, setHasVariants] = useState(false);
  const [variantRows, setVariantRows] = useState<VariantRow[]>([]);

  const {
    register,
    control,
    handleSubmit,
    reset,
    getValues,
    watch,
    setValue,
    formState: { errors },
  } = useForm<ProductFormInput>({
    resolver: zodResolver(productFormSchema),
    defaultValues: defaultsFor(product),
  });

  useEffect(() => {
    if (!open) return;
    // Resets the form to the sheet's initial values whenever it opens for a
    // (possibly different) product, rather than tracking each field back to
    // props individually.
    reset(defaultsFor(product));
    setTagInput("");
    setSkuMode("auto");
    setSkuPrefix("");
    setIdStatus(null);
    setHasVariants(false);
    setVariantRows([]);
  }, [open, product, reset]);

  const skuValue = watch("sku") ?? "";
  const barcodeValue = watch("barcode") ?? "";

  // Debounced duplicate check (manual entry, and edits). The unique indexes still decide at save time.
  const checkedSku = skuMode === "manual" || product ? skuValue.trim() : "";
  const checkedBarcode = String(barcodeValue).trim();
  useEffect(() => {
    if (!open) return;
    const sku = checkedSku && checkedSku.toUpperCase() !== (product?.sku ?? "").toUpperCase() ? checkedSku : "";
    const barcode = checkedBarcode && checkedBarcode !== (product?.barcode ?? "") ? checkedBarcode : "";
    if (!sku && !barcode) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      checkProductIdentifiers({ sku, barcode, excludeId: product?.id })
        .then((result) => !cancelled && setIdStatus(result))
        .catch(() => !cancelled && setIdStatus(null));
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, checkedSku, checkedBarcode, product]);

  // Hardware scanner: capture the burst instead of letting it type into whichever field has focus.
  function applyScan(code: string) {
    setValue("barcode", code, { shouldDirty: true, shouldValidate: true });
    const gs1 = validateGs1Barcode(code);
    if (gs1.isValid) toast.success(`Scanned ${gs1.type} ${code}`);
    else toast.error(`Scanned ${code} — invalid ${gs1.type} check digit`);
  }
  useScannerBurst(applyScan, open && !product && skuMode === "scan");

  const costPrice = watch("cost_price");
  const retailPrice = watch("retail_price");
  const imageUrl = watch("image_url");
  const tags = watch("tags") ?? [];
  const margin = computeMarginPercent(Number(costPrice) || 0, Number(retailPrice) || 0);

  function addTag() {
    const value = tagInput.trim();
    if (!value || tags.includes(value)) {
      setTagInput("");
      return;
    }
    setValue("tags", [...tags, value]);
    setTagInput("");
  }

  function handleTagKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag();
    } else if (e.key === "Backspace" && !tagInput && tags.length > 0) {
      setValue("tags", tags.slice(0, -1));
    }
  }

  async function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error("Image must be smaller than 5MB.");
      return;
    }

    setIsUploading(true);
    try {
      const supabase = createClient();
      const extension = file.name.split(".").pop() || "jpg";
      const path = `products/${storeId}/${crypto.randomUUID()}.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from("mall-assets")
        .upload(path, file, { cacheControl: "3600", upsert: false });
      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from("mall-assets").getPublicUrl(path);
      setValue("image_url", data.publicUrl);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Image upload failed");
    } finally {
      setIsUploading(false);
    }
  }

  async function onFormSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Automated / scan modes: the SKU number is only drawn from the counter when actually saving,
    // so cancelling the sheet never burns a sequence number.
    if (!product && skuMode !== "manual" && !getValues("sku")?.trim()) {
      setIsGenerating(true);
      try {
        setValue("sku", await generateProductSku(skuPrefix), { shouldValidate: true });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not generate a SKU");
        return;
      } finally {
        setIsGenerating(false);
      }
    }
    return handleSubmit(submit)(e);
  }

  function submit(values: ProductFormInput) {
    startTransition(async () => {
      try {
        if (!product && hasVariants) {
          if (variantRows.length === 0) throw new Error("Add at least one variant option value.");
          const { current_stock: _stock, barcode: _barcode, ...base } = values;
          void _stock;
          void _barcode;
          const result = await createProductWithVariants({
            ...base,
            variants: variantRows.map((r) => ({
              sku: variantSku(values.sku, r),
              barcode: r.barcode || null,
              retail_price: Number(r.retail_price) || 0,
              cost_price: Number(r.cost_price) || 0,
              current_stock: Number(r.current_stock) || 0,
              variant_attributes: r.attributes,
            })),
          });
          toast.success(`Created ${result.variantCount} variants`);
          onOpenChange(false);
          return;
        }
        if (product) {
          await updateProduct(product.id, values);
          toast.success("Product updated");
        } else {
          await createProduct(values);
          toast.success("Product created");
        }
        onOpenChange(false);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Something went wrong");
      }
    });
  }

  const busy = isPending || isUploading || isGenerating;
  const skuField = register("sku");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{product ? "Edit product" : "New product"}</SheetTitle>
          <SheetDescription>
            {product
              ? "Update pricing, stock, and categorization for this SKU."
              : "Add a new SKU to this store's catalog."}
          </SheetDescription>
        </SheetHeader>

        <form
          id="product-form"
          onSubmit={onFormSubmit}
          className="flex flex-1 flex-col gap-4 px-4"
        >
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy}
              className="relative flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed bg-muted text-muted-foreground transition-colors hover:border-foreground/40 disabled:opacity-50"
            >
              {isUploading ? (
                <Loader2 className="size-5 animate-spin" />
              ) : imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageUrl} alt="" className="size-full object-cover" />
              ) : (
                <ImagePlus className="size-5" />
              )}
            </button>
            <div className="flex flex-col gap-1">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleImageSelect}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={busy}
              >
                {imageUrl ? "Replace image" : "Upload or capture image"}
              </Button>
              {imageUrl && (
                <button
                  type="button"
                  onClick={() => setValue("image_url", null)}
                  className="text-left text-xs text-muted-foreground hover:text-destructive"
                >
                  Remove image
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 flex flex-col gap-1.5">
              <Label htmlFor="product-name">Name</Label>
              <Input
                id="product-name"
                {...register("name")}
                disabled={busy}
                autoFocus
                aria-invalid={!!errors.name}
              />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>

            <div className="col-span-2 flex flex-col gap-2">
              {!product && (
                <div role="tablist" aria-label="SKU generation mode" className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
                  {SKU_MODES.map((mode) => (
                    <button
                      key={mode.value}
                      type="button"
                      role="tab"
                      aria-selected={skuMode === mode.value}
                      data-testid={`sku-mode-${mode.value}`}
                      onClick={() => {
                        setSkuMode(mode.value);
                        setIdStatus(null);
                      }}
                      disabled={busy}
                      className={cn(
                        "flex items-center justify-center gap-1 rounded-md px-1.5 py-1.5 text-[11px] font-medium leading-tight transition-colors",
                        skuMode === mode.value ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <mode.icon className="size-3.5 shrink-0" />
                      <span>{mode.label}</span>
                    </button>
                  ))}
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="product-sku">SKU</Label>
                <div className="flex gap-2">
                  {!product && skuMode !== "manual" && (
                    <Input
                      aria-label="SKU prefix"
                      value={skuPrefix}
                      onChange={(e) => setSkuPrefix(e.target.value.toUpperCase())}
                      disabled={busy}
                      maxLength={10}
                      placeholder="Prefix"
                      className="w-24 font-mono"
                    />
                  )}
                  <Input
                    id="product-sku"
                    {...skuField}
                    onChange={(e) => {
                      if (!product && skuMode === "manual") e.target.value = e.target.value.toUpperCase();
                      setIdStatus(null);
                      skuField.onChange(e);
                    }}
                    disabled={busy}
                    className="flex-1 font-mono"
                    aria-invalid={!!errors.sku || !!idStatus?.skuTaken}
                    placeholder={!product && skuMode !== "manual" ? "Assigned automatically on save" : "e.g. WATCH-DIVER-01"}
                  />
                  {!product && skuMode !== "manual" && (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy}
                      data-testid="generate-sku-btn"
                      onClick={async () => {
                        setIsGenerating(true);
                        try {
                          setValue("sku", await generateProductSku(skuPrefix), { shouldValidate: true });
                        } catch (error) {
                          toast.error(error instanceof Error ? error.message : "Could not generate a SKU");
                        } finally {
                          setIsGenerating(false);
                        }
                      }}
                    >
                      {isGenerating ? <Loader2 className="animate-spin" /> : <Wand2 />}
                      Generate
                    </Button>
                  )}
                </div>
                {errors.sku && <p className="text-xs text-destructive">{errors.sku.message}</p>}
                {idStatus?.skuTaken && (
                  <p className="flex items-center gap-1 text-xs text-destructive" data-testid="sku-taken">
                    <AlertCircle className="size-3" /> This SKU is already used in this store.
                  </p>
                )}
                {(skuMode === "manual" || product) && checkedSku && idStatus && !idStatus.skuTaken && checkedSku.toUpperCase() !== (product?.sku ?? "").toUpperCase() && (
                  <p className="flex items-center gap-1 text-xs text-emerald-600" data-testid="sku-free">
                    <CheckCircle2 className="size-3" /> Available
                  </p>
                )}
              </div>
            </div>

            {!(hasVariants && !product) && (
              <div className="col-span-2 flex flex-col gap-1.5">
                <Label htmlFor="product-barcode">Barcode (manufacturer GTIN)</Label>
                <div className="flex gap-2">
                  <Input
                    id="product-barcode"
                    {...register("barcode")}
                    disabled={busy}
                    className="flex-1 font-mono"
                    placeholder={!product && skuMode === "scan" ? "Scan now — or use the camera" : "Optional"}
                    aria-invalid={!!errors.barcode || !!idStatus?.barcodeTaken}
                  />
                  {!product && skuMode === "scan" && (
                    <Button type="button" variant="outline" onClick={() => setCameraOpen(true)} disabled={busy} data-testid="camera-scan-btn">
                      <Camera />
                      Camera
                    </Button>
                  )}
                </div>
                {!product && skuMode === "scan" && (
                  <p className="text-xs text-muted-foreground" data-testid="scan-ready">
                    Ready — point a hardware scanner at the product; it will not type into other fields.
                  </p>
                )}
                {errors.barcode && <p className="text-xs text-destructive">{errors.barcode.message}</p>}
                {barcodeValue && !errors.barcode && (
                  <p className={cn("text-xs", validateGs1Barcode(String(barcodeValue)).isValid ? "text-muted-foreground" : "text-destructive")} data-testid="gs1-hint">
                    {validateGs1Barcode(String(barcodeValue)).type}
                    {validateGs1Barcode(String(barcodeValue)).isValid ? " · valid" : " · invalid check digit"}
                  </p>
                )}
                {idStatus?.barcodeTaken && (
                  <p className="flex items-center gap-1 text-xs text-destructive" data-testid="barcode-taken">
                    <AlertCircle className="size-3" /> This barcode is already used in this store.
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Category</Label>
            <Controller
              control={control}
              name="category_id"
              render={({ field }) => (
                <CategorySelect
                  categories={categories}
                  value={field.value ?? "none"}
                  onValueChange={(value) => field.onChange(value === "none" ? null : value)}
                  noneLabel="Uncategorized"
                  disabled={busy}
                />
              )}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="product-tags">Secondary categories / tags</Label>
            <div className="flex min-h-8 flex-wrap items-center gap-1.5 rounded-lg border border-input px-2 py-1.5">
              {tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="gap-1">
                  {tag}
                  <button
                    type="button"
                    onClick={() => setValue("tags", tags.filter((t) => t !== tag))}
                    disabled={busy}
                  >
                    <X className="size-3" />
                  </button>
                </Badge>
              ))}
              <input
                id="product-tags"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleTagKeyDown}
                onBlur={addTag}
                disabled={busy}
                placeholder={tags.length === 0 ? "Type and press Enter" : ""}
                className="min-w-24 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="product-cost">Cost price</Label>
              <Input
                id="product-cost"
                type="number"
                min={0}
                step="0.01"
                {...register("cost_price")}
                disabled={busy}
                className="font-mono"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="product-retail">Retail price</Label>
              <Input
                id="product-retail"
                type="number"
                min={0}
                step="0.01"
                {...register("retail_price")}
                disabled={busy}
                className="font-mono"
              />
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Margin: <span className="font-mono">{margin.toFixed(1)}%</span> · Profit per unit:{" "}
            <span className="font-mono">
              {formatPrice((Number(retailPrice) || 0) - (Number(costPrice) || 0))}
            </span>
          </p>

          {!product && (
            <div className="flex items-center justify-between rounded-lg border px-3 py-2">
              <div className="flex flex-col">
                <Label htmlFor="product-has-variants">This product has variants</Label>
                <p className="text-xs text-muted-foreground">Size, color… each variant gets its own SKU, barcode, price and stock.</p>
              </div>
              <Switch id="product-has-variants" checked={hasVariants} onCheckedChange={setHasVariants} disabled={busy} data-testid="has-variants" />
            </div>
          )}
          {!product && hasVariants && (
            <VariantMatrixBuilder
              baseSku={skuValue}
              defaults={{ retail_price: String(retailPrice ?? 0), cost_price: String(costPrice ?? 0) }}
              rows={variantRows}
              onRowsChange={setVariantRows}
              disabled={busy}
            />
          )}

          <div className="grid grid-cols-2 gap-3">
            {!(hasVariants && !product) && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="product-stock">Current stock</Label>
              <Input
                id="product-stock"
                type="number"
                min={0}
                step="1"
                {...register("current_stock")}
                disabled={busy}
                className="font-mono"
              />
            </div>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="product-threshold">Low-stock threshold</Label>
              <Controller
                control={control}
                name="min_threshold"
                render={({ field }) => (
                  <Input
                    id="product-threshold"
                    type="number"
                    min={0}
                    step="1"
                    value={field.value ?? ""}
                    onChange={(e) =>
                      field.onChange(e.target.value === "" ? null : Number(e.target.value))
                    }
                    disabled={busy}
                    placeholder="Use category default"
                    className="font-mono"
                  />
                )}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="product-description">Description</Label>
            <Textarea
              id="product-description"
              {...register("description")}
              disabled={busy}
              placeholder="Optional"
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border px-3 py-2">
            <div className="flex flex-col">
              <Label htmlFor="product-active">Active</Label>
              <p className="text-xs text-muted-foreground">
                Inactive products are hidden from POS search.
              </p>
            </div>
            <Controller
              control={control}
              name="is_active"
              render={({ field }) => (
                <Switch
                  id="product-active"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  disabled={busy}
                />
              )}
            />
          </div>
        </form>

        <CameraBarcodeScanner open={cameraOpen} onOpenChange={setCameraOpen} onDetect={(code) => { applyScan(code); setCameraOpen(false); }} />

        <SheetFooter>
          <Button type="submit" form="product-form" disabled={busy} className="w-full">
            {isPending ? "Saving..." : product ? "Save changes" : "Create product"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
