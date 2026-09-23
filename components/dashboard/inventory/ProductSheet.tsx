"use client";

import { useEffect, useRef, useState, useTransition, type KeyboardEvent } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { X, ImagePlus, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { createProduct, updateProduct } from "@/lib/actions/products";
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
import type { Category, ProductWithCategory } from "@/lib/types/domain";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

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

  const {
    register,
    control,
    handleSubmit,
    reset,
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
  }, [open, product, reset]);

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

  function submit(values: ProductFormInput) {
    startTransition(async () => {
      try {
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

  const busy = isPending || isUploading;

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
          onSubmit={handleSubmit(submit)}
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

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="product-sku">SKU</Label>
              <Input
                id="product-sku"
                {...register("sku")}
                disabled={busy}
                className="font-mono"
                aria-invalid={!!errors.sku}
              />
              {errors.sku && <p className="text-xs text-destructive">{errors.sku.message}</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="product-barcode">Barcode</Label>
              <Input
                id="product-barcode"
                {...register("barcode")}
                disabled={busy}
                className="font-mono"
                placeholder="Optional"
              />
            </div>
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

          <div className="grid grid-cols-2 gap-3">
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

        <SheetFooter>
          <Button type="submit" form="product-form" disabled={busy} className="w-full">
            {isPending ? "Saving..." : product ? "Save changes" : "Create product"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
