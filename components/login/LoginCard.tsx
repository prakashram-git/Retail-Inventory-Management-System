"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { login } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ForgotPasswordDialog } from "./ForgotPasswordDialog";

// Supabase's signup validator rejects non-standard TLDs (e.g. ".mall"), so
// these use ".com"-shaped addresses even though the accounts are demo-only.
const DEMO_ACCOUNTS = [
  { label: "Super Admin", email: "superadmin@malldemo.com", password: "demo-super-admin" },
  { label: "Store Manager", email: "manager@malldemo.com", password: "demo-store-manager" },
  { label: "Cashier", email: "cashier@malldemo.com", password: "demo-cashier" },
] as const;

export function LoginCard() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [forgotOpen, setForgotOpen] = useState(false);

  function submit(formData: FormData) {
    startTransition(async () => {
      const result = await login(formData);
      if (result.success && result.redirectUrl) {
        router.push(result.redirectUrl);
      } else {
        toast.error(result.error ?? "Login failed. Please try again.");
      }
    });
  }

  function fillDemo(account: (typeof DEMO_ACCOUNTS)[number]) {
    setEmail(account.email);
    setPassword(account.password);

    const formData = new FormData();
    formData.set("email", account.email);
    formData.set("password", account.password);
    submit(formData);
  }

  return (
    <div className="w-[calc(100%-2rem)] max-w-md mx-auto p-8 rounded-3xl border border-white/20 bg-white/15 dark:bg-zinc-950/45 backdrop-blur-3xl shadow-2xl">
      <Badge
        variant="outline"
        className="mb-6 gap-2 border-white/30 bg-black/20 px-3 py-1 text-white backdrop-blur-sm"
      >
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
        </span>
        System Operational
      </Badge>

      <h1 className="text-2xl font-semibold text-white">Welcome back</h1>
      <p className="mt-1 text-sm text-white/70">
        Sign in to access your store console.
      </p>

      <form
        action={submit}
        className="mt-6 flex flex-col gap-4"
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email" className="text-white/90">
            Email
          </Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            disabled={isPending}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="touch-target border-white/30 bg-white/10 text-white placeholder:text-white/50"
            placeholder="you@store.com"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password" className="text-white/90">
              Password
            </Label>
            <button
              type="button"
              onClick={() => setForgotOpen(true)}
              className="text-xs text-white/70 underline-offset-2 hover:text-white hover:underline"
            >
              Forgot password?
            </button>
          </div>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            disabled={isPending}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="touch-target border-white/30 bg-white/10 text-white placeholder:text-white/50"
            placeholder="••••••••"
          />
        </div>

        <Button type="submit" disabled={isPending} className="touch-target mt-2">
          {isPending ? "Signing in..." : "Sign in"}
        </Button>
      </form>

      <ForgotPasswordDialog open={forgotOpen} onOpenChange={setForgotOpen} />

      <div className="mt-6 border-t border-white/15 pt-4">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-white/60">
          Quick demo access
        </p>
        <div className="flex flex-wrap gap-2">
          {DEMO_ACCOUNTS.map((account) => (
            <Button
              key={account.label}
              type="button"
              variant="outline"
              size="sm"
              disabled={isPending}
              onClick={() => fillDemo(account)}
              className="touch-target border-white/30 bg-white/10 text-white hover:bg-white/20"
            >
              {account.label}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
