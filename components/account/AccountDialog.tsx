"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { KeyRound } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ChangePasswordDialog } from "./ChangePasswordDialog";
import { updatePhoneNumber } from "@/lib/actions/auth";

interface AccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialPhone: string | null;
}

/**
 * POS has no dashboard Settings surface for cashiers to reach, so this
 * bundles the same phone-number + change-password controls that live on
 * /dashboard/settings/account into a single dialog reachable from the POS
 * header instead.
 */
export function AccountDialog({ open, onOpenChange, initialPhone }: AccountDialogProps) {
  const [phone, setPhone] = useState(initialPhone ?? "");
  const [isPending, startTransition] = useTransition();
  const [passwordOpen, setPasswordOpen] = useState(false);

  function savePhone() {
    startTransition(async () => {
      const result = await updatePhoneNumber(phone);
      if (result.success) {
        toast.success("Phone number updated");
      } else {
        toast.error(result.error ?? "Something went wrong");
      }
    });
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Account</DialogTitle>
            <DialogDescription>Update your contact number or password.</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pos-account-phone">Phone number</Label>
            <div className="flex gap-2">
              <Input
                id="pos-account-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={isPending}
                placeholder="+14155551234"
              />
              <Button onClick={savePhone} disabled={isPending} variant="outline">
                {isPending ? "Saving..." : "Save"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Used for password-reset codes sent by SMS, once enabled.
            </p>
          </div>

          <Separator />

          <Button
            variant="outline"
            className="w-fit gap-1.5"
            onClick={() => setPasswordOpen(true)}
          >
            <KeyRound className="size-4" />
            Change password
          </Button>
        </DialogContent>
      </Dialog>

      <ChangePasswordDialog open={passwordOpen} onOpenChange={setPasswordOpen} />
    </>
  );
}
