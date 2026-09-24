"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { useStore } from "@/components/providers/StoreProvider";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TimeRangePicker } from "@/components/dashboard/TimeRangePicker";
import { ORDERS_RANGE_PRESETS, type OrdersRangePreset } from "@/lib/orders/range";
import { ORDER_STATUS_LABEL, ORDER_STATUS_VARIANT } from "@/lib/orders/status";
import { OrderDetailSheet } from "./OrderDetailSheet";
import type { OrderRow } from "@/lib/orders/types";

type StatusFilter =
  | "all"
  | "completed"
  | "offline_synced"
  | "stock_variance"
  | "refunded"
  | "partially_refunded";

const STATUS_FILTER_LABEL: Record<StatusFilter, string> = {
  all: "All statuses",
  completed: "Completed",
  offline_synced: "Offline synced",
  stock_variance: "Stock variance",
  refunded: "Refunded",
  partially_refunded: "Partially refunded",
};

function matchesStatusFilter(order: OrderRow, filter: StatusFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "completed":
      return order.status === "completed";
    case "offline_synced":
      return order.is_offline_sync;
    case "stock_variance":
      return order.status === "completed_with_stock_variance";
    case "refunded":
      return order.status === "refunded";
    case "partially_refunded":
      return order.status === "partially_refunded";
  }
}

interface OrdersManagerProps {
  orders: OrderRow[];
  range: OrdersRangePreset;
  currentUserId: string;
}

export function OrdersManager({ orders, range, currentUserId }: OrdersManagerProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { formatPrice } = useStore();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  // Derived (not copied) from `orders` so a post-refund router.refresh() is
  // reflected here immediately instead of showing a stale snapshot.
  const selectedOrder = orders.find((order) => order.id === selectedOrderId) ?? null;

  // Lets a deep link (e.g. the inventory page's variance alert banner) open
  // a specific order's detail sheet directly instead of requiring a search.
  useEffect(() => {
    const orderId = searchParams.get("order");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (orderId) setSelectedOrderId(orderId);
  }, [searchParams]);

  function setRange(next: OrdersRangePreset) {
    router.replace(`/dashboard/orders?range=${next}`);
  }

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return orders.filter((order) => {
      if (!matchesStatusFilter(order, statusFilter)) return false;
      if (!query) return true;
      const cashierName = order.cashier?.full_name ?? order.cashier?.email ?? "";
      return (
        order.invoice_number.toLowerCase().includes(query) ||
        cashierName.toLowerCase().includes(query)
      );
    });
  }, [orders, search, statusFilter]);

  return (
    <div className="flex flex-col gap-4">
      <Card size="sm">
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
            <InputGroup className="sm:max-w-72">
              <InputGroupAddon>
                <Search />
              </InputGroupAddon>
              <InputGroupInput
                placeholder="Search invoice # or cashier"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </InputGroup>

            <div className="sm:w-52">
              <Select value={statusFilter} onValueChange={(value) => setStatusFilter((value ?? "all") as StatusFilter)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(STATUS_FILTER_LABEL) as StatusFilter[]).map((key) => (
                    <SelectItem key={key} value={key}>
                      {STATUS_FILTER_LABEL[key]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <TimeRangePicker value={range} onChange={setRange} presets={ORDERS_RANGE_PRESETS} />
        </CardContent>
      </Card>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-12 text-center text-muted-foreground">
          <p className="text-sm">No orders match this search.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border">
          <Table data-tour="orders-table">
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Cashier</TableHead>
                <TableHead>Items</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((order) => (
                <TableRow
                  key={order.id}
                  className="cursor-pointer"
                  onClick={() => setSelectedOrderId(order.id)}
                >
                  <TableCell className="font-mono text-sm">{order.invoice_number}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(order.created_at).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-sm">
                    {order.cashier?.full_name ?? order.cashier?.email ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {order.order_items.reduce((sum, item) => sum + item.quantity, 0)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {formatPrice(order.total)}
                  </TableCell>
                  <TableCell className="text-sm capitalize">
                    {order.payment_method.replace("_", " ")}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      <Badge variant={ORDER_STATUS_VARIANT[order.status]}>{ORDER_STATUS_LABEL[order.status]}</Badge>
                      {order.is_offline_sync && <Badge variant="outline">Offline synced</Badge>}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <OrderDetailSheet
        order={selectedOrder}
        onOpenChange={(open) => !open && setSelectedOrderId(null)}
        currentUserId={currentUserId}
      />
    </div>
  );
}
