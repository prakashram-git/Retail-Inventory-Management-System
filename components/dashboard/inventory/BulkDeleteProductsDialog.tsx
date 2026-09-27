"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { deleteProduct } from "@/lib/actions/products";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { ProductWithCategory } from "@/lib/types/domain";

interface BulkDeleteProductsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: ProductWithCategory[];
  onDeleted: () => void;
}

/** Same soft-delete semantics as DeleteProductDialog, applied to N products in one
 * confirmation — deleteProduct is called once per row (no batch RPC exists, and each
 * call is independently idempotent), so a failure on one product doesn't block the rest. */
export function BulkDeleteProductsDialog({
  open,
  onOpenChange,
  products,
  onDeleted,
}: BulkDeleteProductsDialogProps) {
  const [isPending, startTransition] = useTransition();

  if (products.length === 0) return null;

  function confirmDelete() {
    startTransition(async () => {
      let succeeded = 0;
      let failed = 0;
      for (const product of products) {
        try {
          await deleteProduct(product.id);
          succeeded += 1;
        } catch {
          failed += 1;
        }
      }
      if (failed === 0) {
        toast.success(`${succeeded} product${succeeded === 1 ? "" : "s"} deactivated`);
      } else {
        toast.error(`${succeeded} deactivated, ${failed} failed — try again for the rest`);
      }
      onDeleted();
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>
            Delete {products.length} product{products.length === 1 ? "" : "s"}?
          </DialogTitle>
          <DialogDescription>
            This removes the selected products from the POS catalog and hides them from new
            sales. Their order and stock history are kept, so they stay visible here (marked
            Inactive) and can be reactivated later from each product&apos;s sheet.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={confirmDelete} disabled={isPending}>
            {isPending ? "Deleting..." : `Delete ${products.length} product${products.length === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
