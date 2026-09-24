"use client";

import Link from "next/link";
import { Receipt } from "lucide-react";
import { useStore } from "@/components/providers/StoreProvider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ORDER_STATUS_LABEL, ORDER_STATUS_VARIANT } from "@/lib/orders/status";
import type { OrderRow } from "@/lib/orders/types";

type RecentOrder = Pick<
  OrderRow,
  "id" | "invoice_number" | "total" | "status" | "payment_method" | "is_offline_sync" | "created_at" | "cashier"
>;

const PAYMENT_LABEL: Record<RecentOrder["payment_method"], string> = {
  cash: "Cash",
  card: "Card",
  qr_transfer: "QR transfer",
};

export function RecentOrdersCard({ orders }: { orders: RecentOrder[] }) {
  const { formatPrice } = useStore();

  return (
    <Card size="sm" className="flex flex-col transition-shadow hover:shadow-md">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Recent orders</CardTitle>
        <Button
          variant="ghost"
          size="sm"
          nativeButton={false}
          render={<Link href="/dashboard/orders">View all</Link>}
        />
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        {orders.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center text-muted-foreground">
            <Receipt className="size-6" />
            <p className="text-sm">No orders yet.</p>
          </div>
        ) : (
          orders.map((order) => (
            <div
              key={order.id}
              className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/50"
            >
              <div className="flex min-w-0 flex-col">
                <span className="truncate font-mono text-sm">{order.invoice_number}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {order.cashier?.full_name ?? order.cashier?.email ?? "Unknown cashier"} ·{" "}
                  {PAYMENT_LABEL[order.payment_method]}
                  {order.is_offline_sync && " · Offline synced"}
                </span>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="font-mono text-sm font-medium">{formatPrice(order.total)}</span>
                <Badge variant={ORDER_STATUS_VARIANT[order.status]} className="text-xs">
                  {ORDER_STATUS_LABEL[order.status]}
                </Badge>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
