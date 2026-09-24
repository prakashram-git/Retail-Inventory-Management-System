"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import Link from "next/link";
import { BarChart3, FolderPlus, Loader2, Plus, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Category, CategoryWithCount } from "@/lib/types/domain";
import type { StoreFeatures } from "@/lib/profiles/types";

const TILE =
  "h-auto flex-col gap-2 py-4 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm";

// ssr:false + no loading fallback: the New Product / New Category chunk (react-hook-form,
// zod resolver, the variant matrix builder, …) is only ever requested once the matching
// button is clicked — a store profile with both features off never pulls this code in at all.
const ProductSheet = dynamic(
  () => import("@/components/dashboard/inventory/ProductSheet").then((m) => m.ProductSheet),
  { ssr: false }
);
const CategoryDialog = dynamic(
  () => import("@/components/dashboard/categories/CategoryDialog").then((m) => m.CategoryDialog),
  { ssr: false }
);

function Icon({ children, busy }: { children: React.ReactNode; busy?: boolean }) {
  return (
    <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
      {busy ? <Loader2 className="size-4 animate-spin" /> : children}
    </span>
  );
}

/**
 * New product / New category open their form right here (state-controlled, so
 * the click never depends on a page navigation finishing); POS and Reports are
 * real links. base-ui's `render` prop is the equivalent of Radix `asChild`:
 * the Button *becomes* the anchor, so there is no nested <button> in <a>.
 *
 * Every button is additionally gated by `initialFeatures`, the store's resolved
 * profile — ui_designer's own restriction (`canManageCatalog`) and the profile's
 * restrictions both apply, so either one hides the New Product/Category tiles.
 * The dialog components themselves are dynamically imported (see above) so a
 * disabled feature costs 0 bytes, not just a hidden button.
 */
export function QuickActionsBar({
  categories,
  canManageCatalog,
  initialFeatures,
}: {
  categories: Category[];
  /** ui_designer can't mutate products/categories, so those tiles are hidden for them. */
  canManageCatalog: boolean;
  initialFeatures: StoreFeatures;
}) {
  const [productSheetOpen, setProductSheetOpen] = useState(false);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  // Cold server renders can take a few seconds; show that the click registered.
  const [navigatingTo, setNavigatingTo] = useState<string | null>(null);

  const parentOptions: CategoryWithCount[] = categories
    .filter((c) => !c.parent_id)
    .map((c) => ({ ...c, product_count: 0 }));

  const showNewProduct = canManageCatalog && initialFeatures.allow_new_product;
  const showNewCategory = canManageCatalog && initialFeatures.allow_new_category;
  const showPos = initialFeatures.allow_pos_shortcut;
  const showReports = initialFeatures.allow_reports_shortcut;
  const anyVisible = showNewProduct || showNewCategory || showPos || showReports;

  if (!anyVisible) return null;

  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {showNewProduct && (
          <Button variant="outline" className={TILE} onClick={() => setProductSheetOpen(true)}>
            <Icon>
              <Plus className="size-4" />
            </Icon>
            New product
          </Button>
        )}
        {showNewCategory && (
          <Button variant="outline" className={TILE} onClick={() => setCategoryDialogOpen(true)}>
            <Icon>
              <FolderPlus className="size-4" />
            </Icon>
            New category
          </Button>
        )}
        {showPos && (
          <Button
            variant="outline"
            className={TILE}
            nativeButton={false}
            render={<Link href="/pos" />}
            onClick={() => setNavigatingTo("/pos")}
          >
            <Icon busy={navigatingTo === "/pos"}>
              <ShoppingCart className="size-4" />
            </Icon>
            Open POS
          </Button>
        )}
        {showReports && (
          <Button
            variant="outline"
            className={TILE}
            nativeButton={false}
            render={<Link href="/dashboard/reports" />}
            onClick={() => setNavigatingTo("/dashboard/reports")}
          >
            <Icon busy={navigatingTo === "/dashboard/reports"}>
              <BarChart3 className="size-4" />
            </Icon>
            View reports
          </Button>
        )}
      </div>

      {showNewProduct && productSheetOpen && (
        <ProductSheet
          open={productSheetOpen}
          onOpenChange={setProductSheetOpen}
          product={null}
          categories={categories}
        />
      )}
      {showNewCategory && categoryDialogOpen && (
        <CategoryDialog
          open={categoryDialogOpen}
          onOpenChange={setCategoryDialogOpen}
          parentOptions={parentOptions}
          category={null}
          defaultParentId={null}
        />
      )}
    </>
  );
}
