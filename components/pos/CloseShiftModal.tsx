"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Printer, CheckCircle2 } from "lucide-react";
import { useStore } from "@/components/providers/StoreProvider";
import { useHelpCenter } from "@/components/help/HelpCenterContext";
import { closeSession, getSessionSalesReport, type SessionSalesReport } from "@/lib/pos/session";
import type { CashDrawerSession } from "@/lib/pos/session";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface CloseShiftModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: CashDrawerSession;
  storeName: string;
  cashierName: string;
  onClosed: () => void;
}

export function CloseShiftModal({
  open,
  onOpenChange,
  session,
  storeName,
  cashierName,
  onClosed,
}: CloseShiftModalProps) {
  const { formatPrice } = useStore();
  const { trainingMode } = useHelpCenter();
  const [countedCash, setCountedCash] = useState("");
  const [notes, setNotes] = useState("");
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{
    report: SessionSalesReport;
    expectedCash: number;
    discrepancy: number;
    closedAt: string;
    countedCash: number;
  } | null>(null);

  function submit() {
    if (trainingMode) {
      toast.info("Training mode — shift not closed, nothing saved");
      onOpenChange(false);
      return;
    }
    const counted = Number(countedCash);
    if (!Number.isFinite(counted) || counted < 0) {
      toast.error("Enter the physically counted cash amount.");
      return;
    }

    startTransition(async () => {
      try {
        const [report, closeResult] = await Promise.all([
          getSessionSalesReport(session.id),
          closeSession(session.id, session.opening_float, counted, notes.trim() || null),
        ]);
        setResult({
          report,
          expectedCash: closeResult.expectedCash,
          discrepancy: closeResult.discrepancy,
          closedAt: closeResult.closedAt,
          countedCash: counted,
        });
        toast.success("Shift closed");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not close the shift");
      }
    });
  }

  function finish() {
    setCountedCash("");
    setNotes("");
    setResult(null);
    onOpenChange(false);
    onClosed();
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !isPending && !next && !result && onOpenChange(next)}>
      <DialogContent className="flex max-h-[85vh] flex-col overflow-y-auto sm:max-w-md">
        {!result ? (
          <>
            <DialogHeader>
              <DialogTitle>Close shift — blind cash count</DialogTitle>
              <DialogDescription>
                Count the physical cash in the drawer and enter it below before the expected
                total is revealed.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="counted-cash" data-tour="close-counted-cash">Physical cash count</Label>
                <Input
                  id="counted-cash"
                  type="number"
                  min={0}
                  step="0.01"
                  value={countedCash}
                  onChange={(e) => setCountedCash(e.target.value)}
                  disabled={isPending}
                  autoFocus
                  className="font-mono text-lg"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="close-notes">Notes (optional)</Label>
                <Textarea
                  id="close-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={isPending}
                  placeholder="Anything worth flagging about this shift"
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={isPending || countedCash.trim() === ""} data-tour="close-submit">
                {isPending ? "Closing..." : "Close shift"}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="size-5 text-emerald-600" />
                Shift closed
              </DialogTitle>
              <DialogDescription>Z-report below can be printed for the drawer log.</DialogDescription>
            </DialogHeader>

            <div
              id="receipt-print-area"
              className="mx-auto w-full max-w-[300px] rounded-lg border bg-card p-4 font-mono text-xs"
            >
              <div className="text-center">
                <p className="text-sm font-bold uppercase">{storeName}</p>
                <p>Z-REPORT — SHIFT CLOSE</p>
                <p>{new Date(result.closedAt).toLocaleString()}</p>
                <p>Cashier: {cashierName}</p>
              </div>

              <div className="my-2 border-t border-dashed" />

              <div className="flex justify-between">
                <span>Opening float</span>
                <span>{formatPrice(session.opening_float)}</span>
              </div>
              <div className="flex justify-between">
                <span>Cash sales</span>
                <span>{formatPrice(result.report.cashTotal)}</span>
              </div>
              <div className="flex justify-between font-bold">
                <span>Expected cash</span>
                <span>{formatPrice(result.expectedCash)}</span>
              </div>
              <div className="flex justify-between">
                <span>Counted cash</span>
                <span>{formatPrice(result.countedCash)}</span>
              </div>
              <div className="flex justify-between font-bold">
                <span>{result.discrepancy < 0 ? "Short" : "Over"}</span>
                <span>{formatPrice(Math.abs(result.discrepancy))}</span>
              </div>

              <div className="my-2 border-t border-dashed" />

              <div className="flex justify-between">
                <span>Card sales</span>
                <span>{formatPrice(result.report.cardTotal)}</span>
              </div>
              <div className="flex justify-between">
                <span>QR transfer sales</span>
                <span>{formatPrice(result.report.qrTotal)}</span>
              </div>
              <div className="flex justify-between">
                <span>Transactions</span>
                <span>{result.report.transactionCount}</span>
              </div>

              <div className="my-2 border-t border-dashed" />
              <p className="text-center">End of shift.</p>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => window.print()}>
                <Printer />
                Print Z-report
              </Button>
              <Button onClick={finish}>Done</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
