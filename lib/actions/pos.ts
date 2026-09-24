"use server";

import bcrypt from "bcryptjs";
import { createClient } from "@/lib/supabase/server";

/**
 * Compares against `profiles.pos_pin_hash` server-side so the hash itself
 * never reaches the browser — a client-side bcrypt.compare would require
 * shipping the hash to the terminal, which is exactly what hashing it was
 * meant to avoid.
 */
export async function verifyPosPin(pin: string): Promise<boolean> {
  const supabase = await createClient();

  const { data: userResult } = await supabase.auth.getUser();
  if (!userResult.user) return false;

  const { data: profile } = await supabase
    .from("profiles")
    .select("pos_pin_hash")
    .eq("id", userResult.user.id)
    .single();

  if (profile?.pos_pin_hash) return bcrypt.compare(pin, profile.pos_pin_hash);

  // No PIN on file (typically managers/admins using "Lock Terminal"): fall
  // back to the account password so a lock never becomes a lock-out.
  if (!userResult.user.email) return false;
  const { error } = await supabase.auth.signInWithPassword({
    email: userResult.user.email,
    password: pin,
  });
  return !error;
}
