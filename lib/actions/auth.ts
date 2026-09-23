"use server";

import { createClient } from "@/lib/supabase/server";

interface LoginResult {
  success: boolean;
  redirectUrl?: string;
  error?: string;
}

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

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
}
