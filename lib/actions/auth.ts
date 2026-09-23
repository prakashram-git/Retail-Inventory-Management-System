"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ACTIVE_STORE_COOKIE } from "@/lib/constants";

interface LoginResult {
  success: boolean;
  redirectUrl?: string;
  error?: string;
}

interface ActionResult {
  success: boolean;
  error?: string;
}

export type ResetChannel = "email" | "phone";

/**
 * Returns a plain JSON result instead of calling next/navigation's redirect()
 * here. redirect() throws a special control-flow error that must propagate
 * unwrapped to Next's renderer — form-action error boundaries and client
 * try/catch around the action can swallow or mis-render it. Returning JSON
 * and letting the client call router.push() sidesteps that entirely.
 */
export async function login(formData: FormData): Promise<LoginResult> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { success: false, error: "Email and password are required." };
  }

  const supabase = await createClient();

  const { data: signInData, error: signInError } =
    await supabase.auth.signInWithPassword({ email, password });

  if (signInError || !signInData.user) {
    return { success: false, error: "Invalid email or password." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", signInData.user.id)
    .single();

  const redirectUrl = profile?.role === "cashier" ? "/pos" : "/dashboard";

  return { success: true, redirectUrl };
}

/**
 * `signOut()` revokes the refresh token server-side and has the SSR client
 * clear the `sb-*-auth-token` cookies via its own `setAll`, but the active
 * store selection is a separate app cookie it doesn't know about — clearing
 * it explicitly keeps the next login from silently reopening the last
 * super_admin's previously chosen store.
 */
export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();

  const cookieStore = await cookies();
  cookieStore.delete(ACTIVE_STORE_COOKIE);

  redirect("/login");
}

/**
 * Self-service password change for any signed-in role. Re-authenticates with
 * the current password first (signInWithPassword, not just a re-fetch of the
 * session) so a hijacked-but-unlocked session can't be used to lock the real
 * owner out by silently swapping the password.
 */
export async function changePassword(
  currentPassword: string,
  newPassword: string
): Promise<ActionResult> {
  if (newPassword.length < 8) {
    return { success: false, error: "New password must be at least 8 characters." };
  }

  const supabase = await createClient();
  const { data: userResult } = await supabase.auth.getUser();
  if (!userResult.user?.email) {
    return { success: false, error: "Not authenticated." };
  }

  const { error: reauthError } = await supabase.auth.signInWithPassword({
    email: userResult.user.email,
    password: currentPassword,
  });
  if (reauthError) {
    return { success: false, error: "Current password is incorrect." };
  }

  const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
  if (updateError) {
    return { success: false, error: updateError.message };
  }

  return { success: true };
}

/**
 * Sends a 6-digit password-reset OTP to either the email or the phone
 * number on file, via Supabase's own OTP delivery (`shouldCreateUser:
 * false` so this never silently provisions a new account). The phone path
 * only actually sends anything once an SMS provider is configured in
 * Supabase Auth settings — until then it surfaces that as a real error,
 * since there's no working demo account to hide it behind.
 */
export async function requestPasswordResetOtp(
  identifier: string,
  channel: ResetChannel
): Promise<ActionResult> {
  const trimmed = identifier.trim();
  if (!trimmed) {
    return { success: false, error: "Enter your email or phone number." };
  }

  const supabase = await createClient();
  const { error } =
    channel === "email"
      ? await supabase.auth.signInWithOtp({
          email: trimmed.toLowerCase(),
          options: { shouldCreateUser: false },
        })
      : await supabase.auth.signInWithOtp({
          phone: trimmed,
          options: { shouldCreateUser: false },
        });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

/**
 * Verifies the OTP (establishing a real session in the process, same as
 * signing in) and immediately sets the new password on it.
 */
export async function verifyPasswordResetOtp(
  identifier: string,
  channel: ResetChannel,
  code: string,
  newPassword: string
): Promise<ActionResult> {
  if (newPassword.length < 8) {
    return { success: false, error: "New password must be at least 8 characters." };
  }

  const supabase = await createClient();
  const trimmed = identifier.trim();

  const { error: verifyError } =
    channel === "email"
      ? await supabase.auth.verifyOtp({ email: trimmed.toLowerCase(), token: code, type: "email" })
      : await supabase.auth.verifyOtp({ phone: trimmed, token: code, type: "sms" });

  if (verifyError) {
    return { success: false, error: "That code is incorrect or has expired." };
  }

  const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
  if (updateError) {
    return { success: false, error: updateError.message };
  }

  return { success: true };
}

/**
 * Self-service contact number update. Writes straight to auth.users.phone
 * via the service-role client (skipping the OTP-verification step a normal
 * client-side phone change would trigger) since the owner is already
 * authenticated here — this is what makes that number usable later as an
 * SMS-OTP password-reset identifier.
 */
export async function updatePhoneNumber(phone: string): Promise<ActionResult> {
  const trimmed = phone.trim();
  if (trimmed && !/^\+[1-9]\d{7,14}$/.test(trimmed)) {
    return {
      success: false,
      error: "Enter a phone number in international format, e.g. +14155551234",
    };
  }

  const supabase = await createClient();
  const { data: userResult } = await supabase.auth.getUser();
  if (!userResult.user) {
    return { success: false, error: "Not authenticated." };
  }

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ phone: trimmed || null })
    .eq("id", userResult.user.id);
  if (profileError) {
    return { success: false, error: profileError.message };
  }

  const admin = createAdminClient();
  const { error: authError } = await admin.auth.admin.updateUserById(userResult.user.id, {
    phone: trimmed,
    phone_confirm: !!trimmed,
  });
  if (authError) {
    return { success: false, error: authError.message };
  }

  return { success: true };
}
