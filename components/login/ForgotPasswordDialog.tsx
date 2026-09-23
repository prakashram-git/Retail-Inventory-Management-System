"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { requestPasswordResetOtp, verifyPasswordResetOtp, type ResetChannel } from "@/lib/actions/auth";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ForgotPasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Step = "request" | "verify";

export function ForgotPasswordDialog({ open, onOpenChange }: ForgotPasswordDialogProps) {
  const [channel, setChannel] = useState<ResetChannel>("email");
  const [identifier, setIdentifier] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [step, setStep] = useState<Step>("request");
  const [isPending, startTransition] = useTransition();

  function reset() {
    setChannel("email");
    setIdentifier("");
    setCode("");
    setNewPassword("");
    setConfirmPassword("");
    setStep("request");
  }

  function close(next: boolean) {
    if (isPending) return;
    onOpenChange(next);
    if (!next) reset();
  }

  function sendCode() {
    startTransition(async () => {
      const result = await requestPasswordResetOtp(identifier, channel);
      if (result.success) {
        toast.success(`Code sent to your ${channel === "email" ? "email" : "phone"}.`);
        setStep("verify");
      } else {
        toast.error(result.error ?? "Couldn't send the code.");
      }
    });
  }

  function submitNewPassword() {
    if (newPassword.length < 8) {
      toast.error("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }

    startTransition(async () => {
      const result = await verifyPasswordResetOtp(identifier, channel, code, newPassword);
      if (result.success) {
        toast.success("Password updated. You can sign in now.");
        close(false);
      } else {
        toast.error(result.error ?? "Something went wrong.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Reset your password</DialogTitle>
          <DialogDescription>
            {step === "request"
              ? "Choose how you'd like to receive your reset code."
              : `Enter the code we sent, and your new password.`}
          </DialogDescription>
        </DialogHeader>

        {step === "request" ? (
          <div className="flex flex-col gap-3">
            <Tabs value={channel} onValueChange={(v) => setChannel(v as ResetChannel)}>
              <TabsList className="w-full">
                <TabsTrigger value="email" className="flex-1" disabled={isPending}>
                  Email
                </TabsTrigger>
                <TabsTrigger value="phone" className="flex-1" disabled={isPending}>
                  Phone
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reset-identifier">
                {channel === "email" ? "Email" : "Phone number"}
              </Label>
              <Input
                id="reset-identifier"
                type={channel === "email" ? "email" : "tel"}
                autoFocus
                disabled={isPending}
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder={channel === "email" ? "you@store.com" : "+14155551234"}
              />
              {channel === "phone" && (
                <p className="text-xs text-muted-foreground">
                  SMS delivery only works once an SMS provider is configured in Supabase.
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reset-code">6-digit code</Label>
              <Input
                id="reset-code"
                inputMode="numeric"
                autoFocus
                disabled={isPending}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="font-mono"
                placeholder="123456"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reset-new-password">New password</Label>
              <Input
                id="reset-new-password"
                type="password"
                autoComplete="new-password"
                disabled={isPending}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reset-confirm-password">Confirm password</Label>
              <Input
                id="reset-confirm-password"
                type="password"
                autoComplete="new-password"
                disabled={isPending}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          {step === "request" ? (
            <>
              <Button variant="outline" onClick={() => close(false)} disabled={isPending}>
                Cancel
              </Button>
              <Button onClick={sendCode} disabled={isPending || !identifier.trim()}>
                {isPending ? "Sending..." : "Send code"}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setStep("request")} disabled={isPending}>
                Back
              </Button>
              <Button
                onClick={submitNewPassword}
                disabled={isPending || code.length !== 6 || !newPassword || !confirmPassword}
              >
                {isPending ? "Resetting..." : "Reset password"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
