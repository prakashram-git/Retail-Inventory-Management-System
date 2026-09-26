"use client";

import { db } from "@/lib/offline/db";

/** Progressive delay before each attempt is even allowed, keyed by the *next* attempt number (1-indexed). */
const PROGRESSIVE_DELAY_MS: Record<number, number> = {
  1: 0,
  2: 500,
  3: 1_000,
  4: 2_000,
  5: 4_000,
  6: 6_000,
};

const MAX_ATTEMPTS_BEFORE_LOCKOUT = 6;
const LOCKOUT_DURATION_MS = 30 * 60 * 1000;

const keyFor = (storeId: string, userId: string) => `${storeId}:${userId}`;

export interface LockoutState {
  /** True while a hard lockout (after 6 failed attempts) is in effect. */
  lockedOut: boolean;
  /** ms remaining until the hard lockout clears, if `lockedOut`. */
  lockedUntilMs: number | null;
  /** Progressive delay (ms) the caller should wait before allowing the next attempt. */
  nextAttemptDelayMs: number;
  failedCount: number;
}

/**
 * Reads the current offline brute-force state for a user's PIN unlock,
 * without recording anything — call before showing the PIN field so a
 * reloaded lock screen still enforces an in-progress lockout.
 */
export async function getLockoutState(storeId: string, userId: string): Promise<LockoutState> {
  const row = await db.pin_unlock_attempts.get(keyFor(storeId, userId));
  if (!row) return { lockedOut: false, lockedUntilMs: null, nextAttemptDelayMs: 0, failedCount: 0 };

  const now = Date.now();
  if (row.locked_until && row.locked_until > now) {
    return {
      lockedOut: true,
      lockedUntilMs: row.locked_until,
      nextAttemptDelayMs: 0,
      failedCount: row.failed_count,
    };
  }

  // Lockout window elapsed: the row is stale but not yet cleared. Treat as
  // reset — a fresh set of attempts starts from zero, matching PCI DSS
  // 8.2.4's "after N minutes" language (the counter doesn't linger forever).
  if (row.locked_until && row.locked_until <= now) {
    return { lockedOut: false, lockedUntilMs: null, nextAttemptDelayMs: 0, failedCount: 0 };
  }

  const delay = PROGRESSIVE_DELAY_MS[row.failed_count + 1] ?? 0;
  return { lockedOut: false, lockedUntilMs: null, nextAttemptDelayMs: delay, failedCount: row.failed_count };
}

/**
 * Records a failed PIN attempt and returns the updated state — call
 * immediately after `verifyPosPin` resolves false. Hard-locks out for
 * LOCKOUT_DURATION_MS once MAX_ATTEMPTS_BEFORE_LOCKOUT is reached.
 */
export async function recordFailedAttempt(storeId: string, userId: string): Promise<LockoutState> {
  const id = keyFor(storeId, userId);
  const existing = await db.pin_unlock_attempts.get(id);
  const now = Date.now();
  const failedCount = (existing?.failed_count ?? 0) + 1;
  const lockedUntil = failedCount >= MAX_ATTEMPTS_BEFORE_LOCKOUT ? now + LOCKOUT_DURATION_MS : null;

  await db.pin_unlock_attempts.put({
    id,
    store_id: storeId,
    user_id: userId,
    failed_count: failedCount,
    locked_until: lockedUntil,
    last_attempt_at: now,
  });

  return {
    lockedOut: lockedUntil !== null,
    lockedUntilMs: lockedUntil,
    nextAttemptDelayMs: lockedUntil ? 0 : (PROGRESSIVE_DELAY_MS[failedCount + 1] ?? 0),
    failedCount,
  };
}

/** Call on a successful unlock — resets the counter for this user/device. */
export async function clearAttempts(storeId: string, userId: string): Promise<void> {
  await db.pin_unlock_attempts.delete(keyFor(storeId, userId));
}
