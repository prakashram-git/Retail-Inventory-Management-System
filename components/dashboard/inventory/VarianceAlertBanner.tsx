import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export interface VarianceOrderSummary {
  id: string;
  invoice_number: string;
}

/**
 * Surfaces orders that synced with `status = completed_with_stock_variance`
 * — an offline sale whose stock decrement no longer matched live inventory
 * by the time it replayed. Each link deep-links into Orders with `?order=`
 * so the flagged sale opens directly instead of making a manager search for it.
 */
export function VarianceAlertBanner({ orders }: { orders: VarianceOrderSummary[] }) {
  if (orders.length === 0) return null;

  return (
    <Alert variant="destructive">
      <TriangleAlert />
      <AlertTitle>
        {orders.length} order{orders.length === 1 ? "" : "s"} synced with a stock variance
      </AlertTitle>
      <AlertDescription>
        <p>
          These offline sales replayed against stock counts that had since changed. Review each
          one and reconcile with a manual adjustment if needed.
        </p>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {orders.map((order) => (
            <Link
              key={order.id}
              href={`/dashboard/orders?range=all&order=${order.id}`}
              className="font-mono text-xs underline underline-offset-2"
            >
              {order.invoice_number}
            </Link>
          ))}
        </div>
      </AlertDescription>
    </Alert>
  );
}
