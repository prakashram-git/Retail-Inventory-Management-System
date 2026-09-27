"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { ChevronDown } from "lucide-react";
import { createCategory, updateCategory } from "@/lib/actions/categories";
import { slugify } from "@/lib/utils/slug";
import { CATEGORY_ICON_OPTIONS, getCategoryIcon } from "@/lib/utils/category-icons";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CategoryWithCount } from "@/lib/types/domain";

interface CategoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Only top-level categories are valid parents, enforcing a 2-level hierarchy. */
  parentOptions: CategoryWithCount[];
  category: CategoryWithCount | null;
  defaultParentId: string | null;
}

/** A visual icon-swatch grid (Notion/Shopify-style) in place of a text
 * dropdown — picking a category's identity is a glance-and-click decision,
 * not something that benefits from reading a list of names. */
function IconPickerButton({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (icon: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const SelectedIcon = getCategoryIcon(value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            className="size-11 shrink-0 p-0"
            aria-label="Choose an icon"
          >
            {/* Icon is looked up from a static map, not defined here — see
                CategoryCard.tsx's identical disable for this heuristic. */}
            {/* eslint-disable-next-line react-hooks/static-components */}
            <SelectedIcon className="size-5" />
          </Button>
        }
      />
      <PopoverContent className="w-56" align="start">
        <p className="px-1 pb-1.5 text-xs font-medium text-muted-foreground">Choose an icon</p>
        <div className="grid grid-cols-6 gap-1">
          {CATEGORY_ICON_OPTIONS.map((option) => {
            const OptionIcon = getCategoryIcon(option);
            const selected = option === value;
            return (
              <button
                key={option}
                type="button"
                title={option}
                onClick={() => {
                  onChange(option);
                  setOpen(false);
                }}
                className={cn(
                  "flex size-8 items-center justify-center rounded-md transition-colors hover:bg-muted",
                  selected && "bg-primary/10 text-primary ring-1 ring-primary/40"
                )}
              >
                <OptionIcon className="size-4" />
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function CategoryDialog({
  open,
  onOpenChange,
  parentOptions,
  category,
  defaultParentId,
}: CategoryDialogProps) {
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState<string | null>(null);
  const [icon, setIcon] = useState<string>("Package");
  const [threshold, setThreshold] = useState("5");
  const [taxExempt, setTaxExempt] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    // Resets the form to the dialog's initial values whenever it opens for
    // a (possibly different) category, rather than tracking each field back
    // to props individually.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setName(category?.name ?? "");
    setParentId(category?.parent_id ?? defaultParentId ?? null);
    setIcon(category?.icon ?? "Package");
    setThreshold(String(category?.default_min_threshold ?? 5));
    setTaxExempt(category?.is_tax_exempt ?? false);
    // Advanced settings only auto-expand when editing a category that
    // already customized them — a brand-new category starts on the compact
    // (collapsed) view every time.
    setShowAdvanced(!!category && (category.default_min_threshold !== 5 || category.is_tax_exempt));
  }, [open, category, defaultParentId]);

  const slugPreview = slugify(name) || "category";
  const eligibleParents = parentOptions.filter((option) => option.id !== category?.id);

  function submit() {
    const input = {
      name,
      parent_id: parentId,
      icon,
      default_min_threshold: Number(threshold) || 0,
      is_tax_exempt: taxExempt,
    };

    startTransition(async () => {
      try {
        if (category) {
          await updateCategory(category.id, input);
          toast.success("Category updated");
        } else {
          const result = await createCategory(input);
          if (!result.success) {
            toast.error(result.error);
            return;
          }
          toast.success("Category created");
        }
        onOpenChange(false);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Something went wrong");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{category ? "Edit category" : "New category"}</DialogTitle>
          <DialogDescription>
            {category
              ? "Update this category's details."
              : "Create a parent category or a subcategory nested under one."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex items-end gap-2">
            <IconPickerButton value={icon} onChange={setIcon} disabled={isPending} />
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="category-name">Name</Label>
              <Input
                id="category-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Menswear"
                disabled={isPending}
                autoFocus
              />
            </div>
          </div>
          <p className="-mt-2 pl-13 text-xs text-muted-foreground">
            /{slugPreview}
          </p>

          <div className="flex flex-col gap-1.5">
            <Label>Parent category</Label>
            <Select
              value={parentId ?? "none"}
              onValueChange={(value) => setParentId(value === "none" ? null : value)}
              disabled={isPending}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="None (top-level category)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None (top-level category)</SelectItem>
                {eligibleParents.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="flex items-center gap-1 self-start text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronDown className={cn("size-3.5 transition-transform", showAdvanced && "rotate-180")} />
            Advanced settings
          </button>

          {showAdvanced && (
            <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="category-threshold">Low-stock threshold</Label>
                <Input
                  id="category-threshold"
                  type="number"
                  min={0}
                  value={threshold}
                  onChange={(e) => setThreshold(e.target.value)}
                  disabled={isPending}
                  className="bg-background"
                />
                <p className="text-xs text-muted-foreground">
                  Default reorder point for new products in this category.
                </p>
              </div>

              <div className="flex items-center justify-between gap-3">
                <div className="flex flex-col">
                  <Label htmlFor="category-tax-exempt">Tax exempt</Label>
                  <p className="text-xs text-muted-foreground">
                    Products here skip sales tax at checkout.
                  </p>
                </div>
                <Switch
                  id="category-tax-exempt"
                  checked={taxExempt}
                  onCheckedChange={setTaxExempt}
                  disabled={isPending}
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={isPending || !name.trim()}>
            {isPending ? "Saving..." : category ? "Save changes" : "Create category"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
