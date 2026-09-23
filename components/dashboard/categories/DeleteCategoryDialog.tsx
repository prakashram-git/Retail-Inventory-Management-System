"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { deleteCategory } from "@/lib/actions/categories";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { CategoryWithCount } from "@/lib/types/domain";

interface DeleteCategoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: CategoryWithCount | null;
  /** Descendant count (subcategories) rolled up for the category being deleted. */
  childCount: number;
  /** Every other category this content could be reassigned to. */
  reassignmentOptions: CategoryWithCount[];
}

export function DeleteCategoryDialog({
  open,
  onOpenChange,
  category,
  childCount,
  reassignmentOptions,
}: DeleteCategoryDialogProps) {
  const [reassignTo, setReassignTo] = useState<string>("none");
  const [isPending, startTransition] = useTransition();

  if (!category) return null;

  const hasContents = category.product_count > 0 || childCount > 0;

  function confirmDelete() {
    startTransition(async () => {
      try {
        await deleteCategory(category!.id, reassignTo === "none" ? null : reassignTo);
        toast.success(`"${category!.name}" deleted`);
        onOpenChange(false);
        setReassignTo("none");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Something went wrong");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete &quot;{category.name}&quot;?</DialogTitle>
          <DialogDescription>This action cannot be undone.</DialogDescription>
        </DialogHeader>

        {hasContents && (
          <div className="flex flex-col gap-3">
            <Alert variant="destructive">
              <AlertTriangle />
              <AlertDescription>
                This category has {category.product_count}{" "}
                {category.product_count === 1 ? "product" : "products"}
                {childCount > 0 &&
                  ` and ${childCount} subcategor${childCount === 1 ? "y" : "ies"}`}
                . Choose where to move them before deleting.
              </AlertDescription>
            </Alert>

            <div className="flex flex-col gap-1.5">
              <Label>Reassign contents to</Label>
              <Select
                value={reassignTo}
                onValueChange={(next) => setReassignTo(next ?? "none")}
                disabled={isPending}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Uncategorized</SelectItem>
                  {reassignmentOptions.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={confirmDelete} disabled={isPending}>
            {isPending ? "Deleting..." : "Delete category"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
