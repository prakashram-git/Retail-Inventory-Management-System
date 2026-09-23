"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_STORE_COOKIE } from "@/lib/constants";

/**
 * Only super_admin can switch to an arbitrary store; other roles are
 * re-pinned to their assigned store_id regardless of what's requested, since
 * the client-side dropdown that calls this is not itself a trust boundary.
 */
export async function switchActiveStore(requestedStoreId: string) {
  const supabase = await createClient();

  const { data: userResult } = await supabase.auth.getUser();
  if (!userResult.user) {
    throw new Error("Not authenticated");
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role, store_id")
    .eq("id", userResult.user.id)
    .single();

  if (error || !profile) {
    throw new Error("Unable to resolve profile");
  }

  const nextStoreId =
    profile.role === "super_admin" ? requestedStoreId : profile.store_id;

  if (!nextStoreId) {
    throw new Error("No store to activate");
  }

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_STORE_COOKIE, nextStoreId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  revalidatePath("/", "layout");
}
