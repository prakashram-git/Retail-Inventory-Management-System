"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Printer, CreditCard, Banknote, QrCode, CheckCircle2 } from "lucide-react";
import { useStore } from "@/components/providers/StoreProvider";
import { useSync } from "@/components/providers/SyncProvider";
import { getQuickTenderDenominations } from "@/lib/utils/currency";
import { submitCheckout } from "@/lib/pos/checkout";
import { useHelp } from "@/components/help/HelpProvider";
import type { CartTotals } from "@/lib/pos/pricing";
import type { CartLine, PaymentMethod } from "@/lib/pos/types";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface CheckoutModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cart: CartLine[];
  totals: CartTotals;
  storeId: string;
  sessionId: string;
  cashierId: string;
  cashierName: string;
  storeName: string;
  unitNumber: string | null;
  floorNumber: string | null;
  onSuccess: () => void;
}

const PAYMENT_METHODS: { value: PaymentMethod; label: string; icon: typeof Banknote }[] = [
  { value: "cash", label: "Cash", icon: Banknote },
  { value: "card", label: "Card", icon: CreditCard },
  { value: "qr_transfer", label: "QR Transfer", icon: QrCode },
];

export function CheckoutModal({
  open,
  onOpenChange,
  cart,
  totals,
  storeId,
  sessionId,
  cashierId,
  cashierName,
  storeName,
  unitNumber,
  floorNumber,
  onSuccess,
}: CheckoutModalProps) {
  const { formatPrice, currency } = useStore();
  const { isOnline } = useSync();
  const { trainingMode } = useHelp();
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [amountTendered, setAmountTendered] = useState("0");
  const [authCode, setAuthCode] = useState("");
  const [cardBrand, setCardBrand] = useState<"Visa" | "Mastercard">("Visa");
  const [cardLastFour, setCardLastFour] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [isPending, startTransition] = useTransition();
  const [completed, setCompleted] = useState<{
    invoiceNumber: string | null;
    offline: boolean;
    paidAt: string;
    paymentMethod: PaymentMethod;
    amountTendered: number;
    cart: CartLine[];
    totals: CartTotals;
  } | null>(null);

  useEffect(() => {
    if (!open) return;
    // Fresh idempotency key per checkout attempt; reused across retries of
    // the *same* attempt (state persists until the dialog closes) so a
    // network blip can't double-charge the customer.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIdempotencyKey(crypto.randomUUID());
    setPaymentMethod("cash");
    setAmountTendered(String(totals.total.toFixed(2)));
    setAuthCode("");
    setCardBrand("Visa");
    setCardLastFour("");
    setCompleted(null);
  }, [open, totals.total]);

  const tenderNumber = Number(amountTendered) || 0;
  const changeDue = paymentMethod === "cash" ? Math.max(0, tenderNumber - totals.total) : 0;
  const cardDetailsValid = /^\d{4}$/.test(cardLastFour) && authCode.trim().length > 0;
  const canSubmit =
    paymentMethod === "cash"
      ? tenderNumber >= totals.total
      : paymentMethod === "card"
        ? cardDetailsValid
        : true;
  const quickTenderOptions =
    paymentMethod === "cash" ? getQuickTenderDenominations(currency, totals.total) : [];

  function submit() {
    startTransition(async () => {
      try {
        const result = await submitCheckout({
          idempotencyKey,
          storeId,
          sessionId,
          cashierId,
          cart,
          paymentMethod,
          discount: totals.discount,
          amountTendered: paymentMethod === "cash" ? tenderNumber : totals.total,
          authCode: paymentMethod === "card" ? authCode.trim() : null,
          cardBrand: paymentMethod === "card" ? cardBrand : null,
          cardLastFour: paymentMethod === "card" ? cardLastFour : null,
          isOnline,
          is_training_mode: trainingMode,
        });

        setCompleted({
          invoiceNumber: result.invoiceNumber,
          offline: result.offline,
          paidAt: new Date().toISOString(),
          paymentMethod,
          amountTendered: paymentMethod === "cash" ? tenderNumber : totals.total,
          cart,
          totals,
        });
        toast.success(
          trainingMode
            ? "Training sale complete — nothing was saved"
            : result.offline
              ? "Sale queued offline"
              : "Sale complete"
        );
        onSuccess();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Checkout failed");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !isPending && onOpenChange(next)}>
      <DialogContent className="flex max-h-[85vh] flex-col overflow-y-auto sm:max-w-md">
        {!completed ? (
          <>
            <DialogHeader>
              <DialogTitle>Charge {formatPrice(totals.total)}</DialogTitle>
              <DialogDescription>
                {cart.reduce((sum, l) => sum + l.quantity, 0)} item(s) ·{" "}
                {isOnline ? "Online" : "Offline — will sync automatically"}
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-3 gap-2" data-tour="checkout-payment">
                {PAYMENT_METHODS.map((method) => (
                  <button
                    key={method.value}
                    type="button"
                    onClick={() => setPaymentMethod(method.value)}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-lg border px-2 py-3 text-sm transition-colors",
                      paymentMethod === method.value
                        ? "border-primary bg-primary/10 text-primary"
                        : "hover:bg-muted"
                    )}
                  >
                    <method.icon className="size-4" />
                    {method.label}
                  </button>
                ))}
              </div>

              {paymentMethod === "cash" && (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="amount-tendered">Amount tendered</Label>
                  <Input
                    id="amount-tendered"
                    type="number"
                    min={0}
                    step="0.01"
                    value={amountTendered}
                    onChange={(e) => setAmountTendered(e.target.value)}
                    className="font-mono text-lg"
                  />
                  {quickTenderOptions.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {quickTenderOptions.map((value) => (
                        <Button
                          key={value}
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setAmountTendered(String(value))}
                        >
                          {formatPrice(value)}
                        </Button>
                      ))}
                    </div>
                  )}
                  <div className="flex justify-between rounded-lg bg-muted px-3 py-2 text-sm">
                    <span className="text-muted-foreground">Change due</span>
                    <span className="font-mono font-medium">{formatPrice(changeDue)}</span>
                  </div>
                </div>
              )}

              {paymentMethod === "card" && (
                <div className="flex flex-col gap-3 rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">
                    Process the charge on the external card terminal first, then record its
                    result here. Never enter a full card number — only the terminal&apos;s auth
                    code and card scheme are captured.
                  </p>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col gap-1.5">
                      <Label>Card scheme</Label>
                      <Select
                        value={cardBrand}
                        onValueChange={(value) => setCardBrand((value ?? "Visa") as "Visa" | "Mastercard")}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Visa">Visa</SelectItem>
                          <SelectItem value="Mastercard">Mastercard</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="card-last-four">Last 4 digits</Label>
                      <Input
                        id="card-last-four"
                        inputMode="numeric"
                        maxLength={4}
                        value={cardLastFour}
                        onChange={(e) => setCardLastFour(e.target.value.replace(/\D/g, "").slice(0, 4))}
                        placeholder="1234"
                        className="font-mono"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="card-auth-code">Payment auth code</Label>
                    <Input
                      id="card-auth-code"
                      value={authCode}
                      onChange={(e) => setAuthCode(e.target.value)}
                      placeholder="From terminal receipt"
                      className="font-mono"
                    />
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-1 rounded-lg border px-3 py-2 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal</span>
                  <span className="font-mono">{formatPrice(totals.subtotal)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>
                    Tax ({totals.taxRatePercent}%{totals.inclusive ? " incl." : ""})
                  </span>
                  <span className="font-mono">{formatPrice(totals.tax)}</span>
                </div>
                <div className="flex justify-between font-semibold">
                  <span>Total</span>
                  <span className="font-mono">{formatPrice(totals.total)}</span>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={isPending || !canSubmit} data-tour="checkout-submit">
                {isPending ? "Processing..." : "Complete sale"}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="size-5 text-emerald-600" />
                Sale complete
              </DialogTitle>
              <DialogDescription>
                {completed.offline
                  ? "Saved locally — will sync once back online."
                  : "Payment processed successfully."}
              </DialogDescription>
            </DialogHeader>

            <div
              id="receipt-print-area"
              className="mx-auto w-full max-w-[300px] rounded-lg border bg-card p-4 font-mono text-xs"
            >
              <div className="text-center">
                <p className="text-sm font-bold uppercase">{storeName}</p>
                <p>
                  {unitNumber ? `Unit ${unitNumber}` : ""}
                  {floorNumber ? ` · Floor ${floorNumber}` : ""}
                </p>
                <p>{new Date(completed.paidAt).toLocaleString()}</p>
                {completed.invoiceNumber && <p>Invoice: {completed.invoiceNumber}</p>}
                <p>Cashier: {cashierName}</p>
                {completed.offline && (
                  <p className="mt-1 font-bold">*** Offline Transaction - Recorded Locally ***</p>
                )}
              </div>

              <div className="my-2 border-t border-dashed" />

              {completed.cart.map((line) => (
                <div key={line.product.id} className="flex justify-between gap-2 py-0.5">
                  <div>
                    <p>{line.product.name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {line.product.category?.name ?? "Uncategorized"} · {line.quantity} x{" "}
                      {formatPrice(line.product.retail_price)}
                    </p>
                  </div>
                  <p className="shrink-0">
                    {formatPrice(line.product.retail_price * line.quantity)}
                  </p>
                </div>
              ))}

              <div className="my-2 border-t border-dashed" />

              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>{formatPrice(completed.totals.subtotal)}</span>
              </div>
              {completed.totals.exemptGross > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Tax-exempt items</span>
                  <span>{formatPrice(completed.totals.exemptGross)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>
                  Tax/GST ({completed.totals.taxRatePercent}%
                  {completed.totals.inclusive ? " incl." : ""})
                </span>
                <span>{formatPrice(completed.totals.tax)}</span>
              </div>
              {completed.totals.discount > 0 && (
                <div className="flex justify-between">
                  <span>Discount</span>
                  <span>-{formatPrice(completed.totals.discount)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold">
                <span>Total</span>
                <span>{formatPrice(completed.totals.total)}</span>
              </div>
              <div className="flex justify-between">
                <span>Paid ({completed.paymentMethod})</span>
                <span>{formatPrice(completed.amountTendered)}</span>
              </div>
              {completed.paymentMethod === "cash" && completed.amountTendered > completed.totals.total && (
                <div className="flex justify-between">
                  <span>Change</span>
                  <span>{formatPrice(completed.amountTendered - completed.totals.total)}</span>
                </div>
              )}

              <div className="my-2 border-t border-dashed" />
              <p className="text-center">Thank you for shopping with us!</p>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => window.print()}>
                <Printer />
                Print receipt
              </Button>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
