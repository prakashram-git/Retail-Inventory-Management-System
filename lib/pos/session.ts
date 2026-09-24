"use client";

import { createClient } from "@/lib/supabase/client";

export interface CashDrawerSession {
  id: string;
  opening_float: number;
  opened_at: string;
}

/** The cashier's currently open drawer for this store, if one exists. */
export async function getOpenSession(
  storeId: string,
  cashierId: string
): Promise<CashDrawerSession | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("cash_drawer_sessions")
    .select("id, opening_float, opened_at")
    .eq("store_id", storeId)
    .eq("cashier_id", cashierId)
    .eq("status", "open")
    .order("opened_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

export async function openSession(
  storeId: string,
  cashierId: string,
  openingFloat: number
): Promise<CashDrawerSession> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("cash_drawer_sessions")
    .insert({ store_id: storeId, cashier_id: cashierId, opening_float: openingFloat })
    .select("id, opening_float, opened_at")
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export interface SessionSalesReport {
  cashTotal: number;
  cardTotal: number;
  qrTotal: number;
  transactionCount: number;
}

/**
 * Tallies this shift's orders by tender type for the Z-report. Voided and
 * fully-refunded orders are excluded from the cash figure so a reversed
 * sale doesn't inflate the drawer's expected cash; a partial refund is left
 * in at its original total, since apportioning the refunded share back to
 * a specific tender isn't tracked anywhere in the schema.
 */
export async function getSessionSalesReport(sessionId: string): Promise<SessionSalesReport> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("orders")
    .select("total, payment_method, status")
    .eq("session_id", sessionId);

  if (error) throw new Error(error.message);

  const orders = (data ?? []).filter((o) => o.status !== "voided" && o.status !== "refunded");

  return {
    cashTotal: orders.filter((o) => o.payment_method === "cash").reduce((s, o) => s + o.total, 0),
    cardTotal: orders.filter((o) => o.payment_method === "card").reduce((s, o) => s + o.total, 0),
    qrTotal: orders.filter((o) => o.payment_method === "qr_transfer").reduce((s, o) => s + o.total, 0),
    transactionCount: orders.length,
  };
}

export interface CloseSessionResult {
  expectedCash: number;
  discrepancy: number;
  closedAt: string;
}

/**
 * Closes the drawer via close_cash_drawer_session(), which recomputes
 * expected_cash/discrepancy server-side from the real orders ledger rather
 * than trusting a client-submitted value — RLS no longer permits a cashier
 * to UPDATE cash_drawer_sessions directly at all (see
 * supabase/analytics_foundation.sql) precisely so this can't be bypassed by
 * a direct client call. openingFloat is accepted for signature
 * compatibility with existing callers but is no longer sent — the RPC reads
 * the session's own stored opening_float instead.
 */
export async function closeSession(
  sessionId: string,
  _openingFloat: number,
  closingCountedCash: number,
  notes: string | null
): Promise<CloseSessionResult> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("close_cash_drawer_session", {
    p_session_id: sessionId,
    p_closing_counted_cash: closingCountedCash,
    p_notes: notes,
  });

  if (error) throw new Error(error.message);
  return { expectedCash: data.expected_cash, discrepancy: data.discrepancy, closedAt: data.closed_at };
}
