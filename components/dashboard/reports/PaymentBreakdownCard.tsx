"use client";

import { Wallet } from "lucide-react";
import { useStore } from "@/components/providers/StoreProvider";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import type { PaymentBreakdownSlice } from "@/lib/reports/aggregate";

const METHOD_LABEL: Record<PaymentBreakdownSlice["method"], string> = {
  cash: "Cash",
  card: "Card",
  qr_transfer: "QR transfer",
};

export function PaymentBreakdownCard({ slices }: { slices: PaymentBreakdownSlice[] }) {
  const { formatPrice } = useStore();

  return (
    <Card size="sm" className="flex flex-col">
      <CardHeader>
        <CardTitle>Payment methods</CardTitle>
        <CardDescription>Net revenue by tender type</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {slices.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center text-muted-foreground">
            <Wallet className="size-6" />
            <p className="text-sm">No sales in this range.</p>
          </div>
        ) : (
          slices.map((slice) => (
            <div key={slice.method} className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{METHOD_LABEL[slice.method]}</span>
                <span className="text-muted-foreground">
                  {slice.orders} {slice.orders === 1 ? "order" : "orders"} ·{" "}
                  <span className="font-mono text-foreground">{formatPrice(slice.revenue)}</span>
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${Math.max(2, slice.share * 100)}%` }}
                />
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
