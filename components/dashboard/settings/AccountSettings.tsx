"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { KeyRound } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChangePasswordDialog } from "@/components/account/ChangePasswordDialog";
import { updatePhoneNumber } from "@/lib/actions/auth";

interface AccountSettingsProps {
  email: string;
  phone: string | null;
}

export function AccountSettings({ email, phone: initialPhone }: AccountSettingsProps) {
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [phone, setPhone] = useState(initialPhone ?? "");
  const [isPending, startTransition] = useTransition();

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
      <Card size="sm" className="max-w-md">
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Signed in as</span>
            <span className="text-sm font-medium">{email}</span>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="account-phone">Phone number</Label>
            <div className="flex gap-2">
              <Input
                id="account-phone"
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

          <Button variant="outline" className="w-fit gap-1.5" onClick={() => setPasswordOpen(true)}>
            <KeyRound className="size-4" />
            Change password
          </Button>
        </CardContent>
      </Card>

      <ChangePasswordDialog open={passwordOpen} onOpenChange={setPasswordOpen} />
    </>
  );
}
