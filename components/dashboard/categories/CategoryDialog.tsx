"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { createCategory, updateCategory } from "@/lib/actions/categories";
import { slugify } from "@/lib/utils/slug";
import { CATEGORY_ICON_OPTIONS, getCategoryIcon } from "@/lib/utils/category-icons";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
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
          await createCategory(input);
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{category ? "Edit category" : "New category"}</DialogTitle>
          <DialogDescription>
            {category
              ? "Update this category's details."
              : "Create a parent category or a subcategory nested under one."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="category-name">Name</Label>
            <Input
              id="category-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Menswear"
              disabled={isPending}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              Slug: <code>/{slugPreview}</code>
              {" "}(deduplicated automatically on save)
            </p>
          </div>

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

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Icon</Label>
              <Select
                value={icon}
                onValueChange={(next) => setIcon(next ?? "Package")}
                disabled={isPending}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_ICON_OPTIONS.map((option) => {
                    const OptionIcon = getCategoryIcon(option);
                    return (
                      <SelectItem key={option} value={option}>
                        <OptionIcon className="size-4" />
                        {option}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="category-threshold">Low-stock threshold</Label>
              <Input
                id="category-threshold"
                type="number"
                min={0}
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                disabled={isPending}
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border px-3 py-2">
            <div className="flex flex-col">
              <Label htmlFor="category-tax-exempt">Tax exempt</Label>
              <p className="text-xs text-muted-foreground">
                Products in this category skip sales tax at checkout.
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
