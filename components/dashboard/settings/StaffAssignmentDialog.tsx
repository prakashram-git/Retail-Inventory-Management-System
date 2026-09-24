"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Copy, CheckCircle2, KeyRound } from "lucide-react";
import { updateStaffAssignment, setStaffActive, resetStaffPassword } from "@/lib/actions/staff";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
  const [phone, setPhone] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [resetPending, startResetTransition] = useTransition();
  const [resetResult, setResetResult] = useState<{ email: string; tempPassword: string } | null>(
    null
  );
  const [resetPanelOpen, setResetPanelOpen] = useState(false);
  const [customPassword, setCustomPassword] = useState("");

  // Keyed on staffMember?.id rather than the staffMember object itself:
  // resetStaffPassword/updateStaffAssignment revalidatePath() refetches
  // `staff` (and `stores`) as new array/object references while this dialog
  // may still be open, and an object-identity-based dependency would re-fire
  // this reset and wipe out resetResult before the admin can copy it.
  useEffect(() => {
    if (!open || !staffMember) return;
    // Resets the form to this staff member's current assignment whenever
    // the dialog opens for a (possibly different) person.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRole(staffMember.role);
    setStoreId(staffMember.store_id ?? stores[0]?.id ?? "");
    setPhone(staffMember.phone ?? "");
    setIsActive(staffMember.is_active);
    setResetResult(null);
    setResetPanelOpen(false);
    setCustomPassword("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, staffMember?.id]);

  if (!staffMember) return null;

  function confirmResetPassword() {
    if (customPassword && customPassword.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }

    startResetTransition(async () => {
      try {
        const result = await resetStaffPassword(staffMember!.id, customPassword.trim() || undefined);
        setResetResult(result);
        setResetPanelOpen(false);
        setCustomPassword("");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Something went wrong");
      }
    });
  }

  function copyResetCredentials() {
    if (!resetResult) return;
    navigator.clipboard
      .writeText(`Email: ${resetResult.email}\nTemporary password: ${resetResult.tempPassword}`)
      .then(() => toast.success("Credentials copied"))
      .catch(() => toast.error("Couldn't copy to clipboard"));
  }

  function submit() {
    startTransition(async () => {
      try {
        await updateStaffAssignment(staffMember!.id, {
          role,
          store_id: role === "super_admin" ? null : storeId || null,
          phone: phone.trim() || undefined,
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

        {resetResult ? (
          <>
            <div className="flex items-center gap-2 text-sm font-medium">
              <CheckCircle2 className="size-5 text-emerald-600" />
              Password reset
            </div>
            <p className="text-sm text-muted-foreground">
              Share these credentials with {resetResult.email} directly — this password is shown
              only once.
            </p>
            <div className="flex flex-col gap-1 rounded-lg border bg-muted px-3 py-2 font-mono text-sm">
              <span>{resetResult.email}</span>
              <span>{resetResult.tempPassword}</span>
            </div>
            <DialogFooter>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button variant="outline" size="icon" onClick={copyResetCredentials} />
                  }
                >
                  <Copy />
                  <span className="sr-only">Copy credentials</span>
                </TooltipTrigger>
                <TooltipContent>Copy credentials</TooltipContent>
              </Tooltip>
              <Button onClick={() => setResetResult(null)}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <>
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

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="staff-phone">Phone</Label>
                <Input
                  id="staff-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled={isPending}
                  placeholder="+14155551234"
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border px-3 py-2">
                <div className="flex flex-col">
                  <Label htmlFor="staff-active">Active</Label>
                  <p className="text-xs text-muted-foreground">
                    Inactive accounts cannot sign in.
                  </p>
                </div>
                <Switch
                  id="staff-active"
                  checked={isActive}
                  onCheckedChange={setIsActive}
                  disabled={isPending}
                />
              </div>

              {resetPanelOpen && (
                <div className="flex flex-col gap-1.5 rounded-lg border p-3">
                  <Label htmlFor="reset-custom-password">New password</Label>
                  <Input
                    id="reset-custom-password"
                    type="password"
                    autoFocus
                    value={customPassword}
                    onChange={(e) => setCustomPassword(e.target.value)}
                    disabled={resetPending}
                    placeholder="Leave blank to generate one"
                  />
                  <div className="mt-1 flex justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setResetPanelOpen(false);
                        setCustomPassword("");
                      }}
                      disabled={resetPending}
                    >
                      Cancel
                    </Button>
                    <Button size="sm" onClick={confirmResetPassword} disabled={resetPending}>
                      {resetPending ? "Resetting..." : "Confirm reset"}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <DialogFooter className="sm:justify-between">
              <Button
                variant="outline"
                className="gap-1.5"
                onClick={() => setResetPanelOpen(true)}
                disabled={resetPending || isPending || resetPanelOpen}
              >
                <KeyRound className="size-4" />
                Reset password
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
                  Cancel
                </Button>
                <Button
                  onClick={submit}
                  disabled={isPending || (role !== "super_admin" && !storeId)}
                >
                  {isPending ? "Saving..." : "Save changes"}
                </Button>
              </div>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
