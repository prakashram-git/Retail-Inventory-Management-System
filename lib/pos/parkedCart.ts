"use client";

import { db, type ParkedCart } from "@/lib/offline/db";
import type { CartLine } from "./types";

const keyFor = (storeId: string, userId: string) => `${storeId}:${userId}`;

export async function parkCart(storeId: string, userId: string, lines: CartLine[]): Promise<void> {
  await db.parked_carts.put({
    id: keyFor(storeId, userId),
    store_id: storeId,
    user_id: userId,
    lines,
    parked_at: new Date().toISOString(),
  });
}

export async function readParkedCart(storeId: string, userId: string): Promise<ParkedCart | undefined> {
  return db.parked_carts.get(keyFor(storeId, userId));
}

export async function clearParkedCart(storeId: string, userId: string): Promise<void> {
  await db.parked_carts.delete(keyFor(storeId, userId));
}
