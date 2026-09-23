"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { updateStaffAssignment, setStaffActive } from "@/lib/actions/staff";
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
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { StaffMember, UserRole } from "@/lib/types/domain";

interface StaffAssignmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staffMember: StaffMember | null;
  stores: { id: string; name: string }[];
}

export function StaffAssignmentDialog({
  open,
  onOpenChange,
  staffMember,
  stores,
}: StaffAssignmentDialogProps) {
  const [role, setRole] = useState<UserRole>("cashier");
  const [storeId, setStoreId] = useState<string>("");
  const [isActive, setIsActive] = useState(true);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open || !staffMember) return;
    // Resets the form to this staff member's current assignment whenever
    // the dialog opens for a (possibly different) person.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRole(staffMember.role);
    setStoreId(staffMember.store_id ?? stores[0]?.id ?? "");
    setIsActive(staffMember.is_active);
  }, [open, staffMember, stores]);

  if (!staffMember) return null;

  function submit() {
    startTransition(async () => {
      try {
        await updateStaffAssignment(staffMember!.id, {
          role,
          store_id: role === "super_admin" ? null : storeId || null,
        });
        if (isActive !== staffMember!.is_active) {
          await setStaffActive(staffMember!.id, isActive);
        }
        toast.success("Staff assignment updated");
        onOpenChange(false);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Something went wrong");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !isPending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{staffMember.full_name ?? staffMember.email}</DialogTitle>
          <DialogDescription>{staffMember.email}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Role</Label>
            <Select value={role} onValueChange={(value) => setRole(value as UserRole)}>
              <SelectTrigger disabled={isPending}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cashier">Cashier</SelectItem>
                <SelectItem value="store_manager">Store manager</SelectItem>
                <SelectItem value="super_admin">Super admin</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {role !== "super_admin" && (
            <div className="flex flex-col gap-1.5">
              <Label>Store</Label>
              <Select value={storeId} onValueChange={(value) => setStoreId(value ?? "")}>
                <SelectTrigger disabled={isPending}>
                  <SelectValue placeholder="Select a store" />
                </SelectTrigger>
                <SelectContent>
                  {stores.map((store) => (
                    <SelectItem key={store.id} value={store.id}>
                      {store.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex items-center justify-between rounded-lg border px-3 py-2">
            <div className="flex flex-col">
              <Label htmlFor="staff-active">Active</Label>
              <p className="text-xs text-muted-foreground">
                Inactive accounts cannot sign in.
              </p>
            </div>
            <Switch id="staff-active" checked={isActive} onCheckedChange={setIsActive} disabled={isPending} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={isPending || (role !== "super_admin" && !storeId)}>
            {isPending ? "Saving..." : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
