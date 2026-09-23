"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Printer } from "lucide-react";
import { useStore } from "@/components/providers/StoreProvider";
import { getSessionSalesReport, type SessionSalesReport } from "@/lib/pos/session";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { TillSessionRow } from "@/lib/reports/types";

interface ReprintZReportModalProps {
  session: TillSessionRow | null;
  onOpenChange: (open: boolean) => void;
}

/**
 * Recomputes the tender breakdown live (it's derivable from `orders` and was
 * never persisted on cash_drawer_sessions) but reuses the cash figures that
 * were locked in at close time — expected_cash/discrepancy/counted cash — so
 * a reprint always matches what was originally handed to the cashier.
 */
export function ReprintZReportModal({ session, onOpenChange }: ReprintZReportModalProps) {
  const { formatPrice, storeName } = useStore();
  const [report, setReport] = useState<SessionSalesReport | null>(null);

  useEffect(() => {
    if (!session) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setReport(null);
      return;
    }
    getSessionSalesReport(session.id)
      .then(setReport)
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : "Could not load this shift's totals");
      });
  }, [session]);

  if (!session) return null;

  return (
    <Dialog open={!!session} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reprint Z-report</DialogTitle>
          <DialogDescription>{session.cashier_name}&apos;s shift</DialogDescription>
        </DialogHeader>

        {!report ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading shift totals…</p>
        ) : (
          <div
            id="receipt-print-area"
            className="mx-auto w-full max-w-[300px] rounded-lg border bg-card p-4 font-mono text-xs"
          >
            <div className="text-center">
              <p className="text-sm font-bold uppercase">{storeName}</p>
              <p>Z-REPORT — SHIFT CLOSE</p>
              <p>{session.closed_at ? new Date(session.closed_at).toLocaleString() : "—"}</p>
              <p>Cashier: {session.cashier_name}</p>
              <p className="mt-1 font-bold">*** REPRINT ***</p>
            </div>

            <div className="my-2 border-t border-dashed" />

            <div className="flex justify-between">
              <span>Opening float</span>
              <span>{formatPrice(session.opening_float)}</span>
            </div>
            <div className="flex justify-between">
              <span>Cash sales</span>
              <span>{formatPrice(report.cashTotal)}</span>
            </div>
            <div className="flex justify-between font-bold">
              <span>Expected cash</span>
              <span>{formatPrice(session.expected_cash ?? 0)}</span>
            </div>
            <div className="flex justify-between">
              <span>Counted cash</span>
              <span>{formatPrice(session.closing_counted_cash ?? 0)}</span>
            </div>
            <div className="flex justify-between font-bold">
              <span>{(session.discrepancy ?? 0) < 0 ? "Short" : "Over"}</span>
              <span>{formatPrice(Math.abs(session.discrepancy ?? 0))}</span>
            </div>

            <div className="my-2 border-t border-dashed" />

            <div className="flex justify-between">
              <span>Card sales</span>
              <span>{formatPrice(report.cardTotal)}</span>
            </div>
            <div className="flex justify-between">
              <span>QR transfer sales</span>
              <span>{formatPrice(report.qrTotal)}</span>
            </div>
            <div className="flex justify-between">
              <span>Transactions</span>
              <span>{report.transactionCount}</span>
            </div>

            <div className="my-2 border-t border-dashed" />
            <p className="text-center">End of shift.</p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => window.print()} disabled={!report}>
            <Printer />
            Print Z-report
          </Button>
          <Button onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
