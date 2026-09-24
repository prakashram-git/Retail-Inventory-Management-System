"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  requestPasswordResetOtp,
  verifyPasswordResetOtp,
  resetPasswordWithCurrentPassword,
  type ResetChannel,
} from "@/lib/actions/auth";
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

type Method = ResetChannel | "password";
type Step = "request" | "verify";

export function ForgotPasswordDialog({ open, onOpenChange }: ForgotPasswordDialogProps) {
  const router = useRouter();
  const [method, setMethod] = useState<Method>("email");
  const [identifier, setIdentifier] = useState("");
  const [code, setCode] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [step, setStep] = useState<Step>("request");
  const [isPending, startTransition] = useTransition();

  function reset() {
    setMethod("email");
    setIdentifier("");
    setCode("");
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setStep("request");
  }

  function close(next: boolean) {
    if (isPending) return;
    onOpenChange(next);
    if (!next) reset();
  }

  function succeedAndEnter(redirectUrl: string | undefined, message: string) {
    toast.success(message);
    close(false);
    if (redirectUrl) router.push(redirectUrl);
  }

  function sendCode() {
    startTransition(async () => {
      const result = await requestPasswordResetOtp(identifier, method as ResetChannel);
      if (result.success) {
        toast.success(`Code sent to your ${method === "email" ? "email" : "phone"}.`);
        setStep("verify");
      } else {
        toast.error(result.error ?? "Couldn't send the code.");
      }
    });
  }

  function submitOtpReset() {
    if (newPassword.length < 8) {
      toast.error("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }

    startTransition(async () => {
      const result = await verifyPasswordResetOtp(
        identifier,
        method as ResetChannel,
        code,
        newPassword
      );
      if (result.success) {
        succeedAndEnter(result.redirectUrl, "Password updated. Signing you in...");
      } else {
        toast.error(result.error ?? "Something went wrong.");
      }
    });
  }

  function submitPasswordReset() {
    if (newPassword.length < 8) {
      toast.error("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }

    startTransition(async () => {
      const result = await resetPasswordWithCurrentPassword(
        identifier,
        currentPassword,
        newPassword
      );
      if (result.success) {
        succeedAndEnter(result.redirectUrl, "Password updated. Signing you in...");
      } else {
        toast.error(result.error ?? "Something went wrong.");
      }
    });
  }

  const otpFlow = method === "email" || method === "phone";

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Reset your password</DialogTitle>
          <DialogDescription>
            {otpFlow && step === "request" && "Choose how you'd like to receive your reset code."}
            {otpFlow && step === "verify" && "Enter the code we sent, and your new password."}
            {!otpFlow && "Know your current password? Set a new one directly."}
          </DialogDescription>
        </DialogHeader>

        {step === "request" && (
          <Tabs value={method} onValueChange={(v) => setMethod(v as Method)}>
            <TabsList className="w-full">
              <TabsTrigger value="email" className="flex-1" disabled={isPending}>
                Email
              </TabsTrigger>
              <TabsTrigger value="phone" className="flex-1" disabled={isPending}>
                Phone
              </TabsTrigger>
              <TabsTrigger value="password" className="flex-1" disabled={isPending}>
                Password
              </TabsTrigger>
            </TabsList>
          </Tabs>
        )}

        {otpFlow && step === "request" && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reset-identifier">{method === "email" ? "Email" : "Phone number"}</Label>
            <Input
              id="reset-identifier"
              type={method === "email" ? "email" : "tel"}
              autoFocus
              disabled={isPending}
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder={method === "email" ? "you@store.com" : "+14155551234"}
            />
            {method === "phone" && (
              <p className="text-xs text-muted-foreground">
                SMS delivery only works once an SMS provider is configured in Supabase.
              </p>
            )}
          </div>
        )}

        {otpFlow && step === "verify" && (
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

        {method === "password" && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reset-pw-email">Email</Label>
              <Input
                id="reset-pw-email"
                type="email"
                autoFocus
                disabled={isPending}
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="you@store.com"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reset-current-password">Current password</Label>
              <Input
                id="reset-current-password"
                type="password"
                autoComplete="current-password"
                disabled={isPending}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reset-pw-new-password">New password</Label>
              <Input
                id="reset-pw-new-password"
                type="password"
                autoComplete="new-password"
                disabled={isPending}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reset-pw-confirm-password">Confirm password</Label>
              <Input
                id="reset-pw-confirm-password"
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
          {method === "password" ? (
            <>
              <Button variant="outline" onClick={() => close(false)} disabled={isPending}>
                Cancel
              </Button>
              <Button
                onClick={submitPasswordReset}
                disabled={
                  isPending ||
                  !identifier.trim() ||
                  !currentPassword ||
                  !newPassword ||
                  !confirmPassword
                }
              >
                {isPending ? "Updating..." : "Update password"}
              </Button>
            </>
          ) : step === "request" ? (
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
                onClick={submitOtpReset}
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
