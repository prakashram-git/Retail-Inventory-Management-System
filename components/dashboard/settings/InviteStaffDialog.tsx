"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Copy, CheckCircle2 } from "lucide-react";
import { inviteStaff } from "@/lib/actions/staff";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { UserRole } from "@/lib/types/domain";

interface InviteStaffDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stores: { id: string; name: string }[];
}

export function InviteStaffDialog({ open, onOpenChange, stores }: InviteStaffDialogProps) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<UserRole>("cashier");
  const [storeId, setStoreId] = useState<string>(stores[0]?.id ?? "");
  const [posPin, setPosPin] = useState("");
  const [isPending, startTransition] = useTransition();
  const [created, setCreated] = useState<{ email: string; tempPassword: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    // Resets the form each time the modal opens for a fresh invite.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFullName("");
    setEmail("");
    setRole("cashier");
    setStoreId(stores[0]?.id ?? "");
    setPosPin("");
    setCreated(null);
  }, [open, stores]);

  const posPinValid = /^\d{4,6}$/.test(posPin);

  function submit() {
    startTransition(async () => {
      try {
        const result = await inviteStaff({
          full_name: fullName,
          email,
          role,
          store_id: role === "super_admin" ? null : storeId || null,
          pos_pin: posPin,
        });
        setCreated(result);
        toast.success("Staff account created");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Something went wrong");
      }
    });
  }

  function copyCredentials() {
    if (!created) return;
    navigator.clipboard
      .writeText(`Email: ${created.email}\nTemporary password: ${created.tempPassword}`)
      .then(() => toast.success("Credentials copied"))
      .catch(() => toast.error("Couldn't copy to clipboard"));
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !isPending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        {!created ? (
          <>
            <DialogHeader>
              <DialogTitle>Invite staff member</DialogTitle>
              <DialogDescription>
                Bind this account to exactly one store and role. Store managers and cashiers
                must be assigned a store.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="staff-name">Full name</Label>
                <Input
                  id="staff-name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  disabled={isPending}
                  autoFocus
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="staff-email">Email</Label>
                <Input
                  id="staff-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isPending}
                />
              </div>

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
                <Label htmlFor="staff-pin">POS PIN</Label>
                <Input
                  id="staff-pin"
                  inputMode="numeric"
                  value={posPin}
                  onChange={(e) => setPosPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  disabled={isPending}
                  className="font-mono"
                  placeholder="4 to 6 digits"
                />
                <p className="text-xs text-muted-foreground">
                  Used to unlock the POS terminal and re-authorize after inactivity lock.
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
                Cancel
              </Button>
              <Button
                onClick={submit}
                disabled={
                  isPending ||
                  !fullName.trim() ||
                  !email.trim() ||
                  !posPinValid ||
                  (role !== "super_admin" && !storeId)
                }
              >
                {isPending ? "Creating..." : "Create account"}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="size-5 text-emerald-600" />
                Account created
              </DialogTitle>
              <DialogDescription>
                Share these credentials with {created.email} directly — this password is shown
                only once and there&apos;s no email delivery configured yet.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-1 rounded-lg border bg-muted px-3 py-2 font-mono text-sm">
              <span>{created.email}</span>
              <span>{created.tempPassword}</span>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={copyCredentials}>
                <Copy />
                Copy credentials
              </Button>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
