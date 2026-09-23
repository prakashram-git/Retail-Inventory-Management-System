import type { OrderStatus } from "./types";

export const ORDER_STATUS_VARIANT: Record<OrderStatus, "outline" | "secondary" | "destructive"> = {
  completed: "secondary",
  completed_with_stock_variance: "outline",
  refunded: "destructive",
  partially_refunded: "outline",
  voided: "destructive",
};

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  completed: "Completed",
  completed_with_stock_variance: "Stock variance",
  refunded: "Refunded",
  partially_refunded: "Partially refunded",
  voided: "Voided",
};
