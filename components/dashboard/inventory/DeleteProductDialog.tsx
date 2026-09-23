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

interface DeleteProductDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: ProductWithCategory | null;
}

export function DeleteProductDialog({ open, onOpenChange, product }: DeleteProductDialogProps) {
  const [isPending, startTransition] = useTransition();

  if (!product) return null;

  function confirmDelete() {
    startTransition(async () => {
      try {
        await deleteProduct(product!.id);
        toast.success(`"${product!.name}" deactivated`);
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
          <DialogTitle>Delete &quot;{product.name}&quot;?</DialogTitle>
          <DialogDescription>
            This removes SKU {product.sku} from the POS catalog and hides it from new sales. Its
            order and stock history are kept, so it stays visible here (marked Inactive) and can
            be reactivated later from the product sheet.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={confirmDelete} disabled={isPending}>
            {isPending ? "Deleting..." : "Delete product"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
