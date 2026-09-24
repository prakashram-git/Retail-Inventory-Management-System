"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface DeleteRowButtonProps {
  itemLabel: string;
  onConfirm: () => Promise<{ softDeleted: boolean }>;
  softDeleteNote: string;
}

/**
 * Row-level delete used by the super-admin Stores/Staff tables. The tables
 * live inside a clickable <TableRow> that opens an edit dialog, so every
 * handler here stops propagation to keep a delete click from also opening
 * that dialog underneath it.
 */
export function DeleteRowButton({ itemLabel, onConfirm, softDeleteNote }: DeleteRowButtonProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleConfirm() {
    startTransition(async () => {
      try {
        const result = await onConfirm();
        toast.success(result.softDeleted ? `${itemLabel} deactivated` : `${itemLabel} deleted`);
        setOpen(false);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Something went wrong");
      }
    });
  }

  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground hover:text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(true);
              }}
            />
          }
        >
          <Trash2 />
          <span className="sr-only">Delete {itemLabel}</span>
        </TooltipTrigger>
        <TooltipContent>Delete</TooltipContent>
      </Tooltip>

      <Dialog open={open} onOpenChange={(next) => !isPending && setOpen(next)}>
        <DialogContent className="sm:max-w-sm" onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Delete {itemLabel}?</DialogTitle>
            <DialogDescription>
              This can&apos;t be undone. {softDeleteNote}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirm} disabled={isPending}>
              {isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
