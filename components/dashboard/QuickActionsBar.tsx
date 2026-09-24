"use client";

import { useState } from "react";
import Link from "next/link";
import { BarChart3, FolderPlus, Loader2, Plus, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProductSheet } from "@/components/dashboard/inventory/ProductSheet";
import { CategoryDialog } from "@/components/dashboard/categories/CategoryDialog";
import type { Category, CategoryWithCount } from "@/lib/types/domain";

const TILE =
  "h-auto flex-col gap-2 py-4 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm";

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
 */
export function QuickActionsBar({
  categories,
  canManageCatalog,
}: {
  categories: Category[];
  /** ui_designer can't mutate products/categories, so those tiles are hidden for them. */
  canManageCatalog: boolean;
}) {
  const [productSheetOpen, setProductSheetOpen] = useState(false);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  // Cold server renders can take a few seconds; show that the click registered.
  const [navigatingTo, setNavigatingTo] = useState<string | null>(null);

  const parentOptions: CategoryWithCount[] = categories
    .filter((c) => !c.parent_id)
    .map((c) => ({ ...c, product_count: 0 }));

  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {canManageCatalog && (
          <>
            <Button variant="outline" className={TILE} onClick={() => setProductSheetOpen(true)}>
              <Icon>
                <Plus className="size-4" />
              </Icon>
              New product
            </Button>
            <Button variant="outline" className={TILE} onClick={() => setCategoryDialogOpen(true)}>
              <Icon>
                <FolderPlus className="size-4" />
              </Icon>
              New category
            </Button>
          </>
        )}
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
      </div>

      {canManageCatalog && (
        <>
          <ProductSheet
            open={productSheetOpen}
            onOpenChange={setProductSheetOpen}
            product={null}
            categories={categories}
          />
          <CategoryDialog
            open={categoryDialogOpen}
            onOpenChange={setCategoryDialogOpen}
            parentOptions={parentOptions}
            category={null}
            defaultParentId={null}
          />
        </>
      )}
    </>
  );
}
