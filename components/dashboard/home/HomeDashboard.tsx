"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  DollarSign,
  TrendingUp,
  Receipt as ReceiptIcon,
  Boxes,
  Plus,
  FolderPlus,
  ShoppingCart,
  BarChart3,
} from "lucide-react";
import { useStore } from "@/components/providers/StoreProvider";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { InventoryKpiGrid } from "@/components/dashboard/inventory/InventoryKpiGrid";
import { RevenueCogsAreaChart } from "@/components/dashboard/reports/RevenueCogsAreaChart";
import {
  buildKpiSummary,
  buildRevenueVsCogsSeries,
  buildTopProducts,
} from "@/lib/reports/aggregate";
import { getEffectiveThreshold, getStockStatus } from "@/lib/utils/inventory";
import type { ReportsSaleLine } from "@/lib/reports/types";
import type { Category, Product } from "@/lib/types/domain";
import type { OrderRow } from "@/lib/orders/types";
import { RecentOrdersCard } from "./RecentOrdersCard";
import { LowStockCard } from "./LowStockCard";
import { TopProductsCard } from "./TopProductsCard";
import { CategoryOverviewCard } from "./CategoryOverviewCard";

interface HomeDashboardProps {
  categories: Category[];
  products: Product[];
  todaySalesLines: ReportsSaleLine[];
  weekSalesLines: ReportsSaleLine[];
  recentOrders: Pick<
    OrderRow,
    "id" | "invoice_number" | "total" | "status" | "payment_method" | "is_offline_sync" | "created_at" | "cashier"
  >[];
  timezone: string;
  /** Net units sold per day over the last 30 days, keyed by product id — feeds the reorder suggestion. */
  velocityByProductId: Record<string, number>;
}

const QUICK_ACTIONS = [
  { href: "/dashboard/inventory", label: "New product", icon: Plus },
  { href: "/dashboard/categories", label: "New category", icon: FolderPlus },
  { href: "/pos", label: "Open POS", icon: ShoppingCart },
  { href: "/dashboard/reports", label: "View reports", icon: BarChart3 },
];

export function HomeDashboard({
  categories,
  products,
  todaySalesLines,
  weekSalesLines,
  recentOrders,
  timezone,
  velocityByProductId,
}: HomeDashboardProps) {
  const { formatPrice } = useStore();
  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const todayKpis = useMemo(() => buildKpiSummary(todaySalesLines, []), [todaySalesLines]);
  const weekTrend = useMemo(
    () => buildRevenueVsCogsSeries(weekSalesLines, timezone, "day"),
    [weekSalesLines, timezone]
  );
  const topProducts = useMemo(() => buildTopProducts(weekSalesLines, 5), [weekSalesLines]);

  const activeProducts = useMemo(() => products.filter((p) => p.is_active), [products]);
  const stockAlerts = useMemo(() => {
    let low = 0;
    let out = 0;
    for (const product of activeProducts) {
      const threshold = getEffectiveThreshold(product, categoryById.get(product.category_id ?? ""));
      const status = getStockStatus(product.current_stock, threshold);
      if (status === "low") low += 1;
      if (status === "out") out += 1;
    }
    return { low, out };
  }, [activeProducts, categoryById]);

  const productCountById = useMemo(() => {
    const counts = new Map<string, number>();
    for (const product of products) {
      if (!product.category_id) continue;
      counts.set(product.category_id, (counts.get(product.category_id) ?? 0) + 1);
    }
    return counts;
  }, [products]);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {QUICK_ACTIONS.map((action) => (
          <Button
            key={action.href}
            variant="outline"
            className="h-auto flex-col gap-2 py-4 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm"
            nativeButton={false}
            render={<Link href={action.href} />}
          >
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <action.icon className="size-4" />
            </span>
            {action.label}
          </Button>
        ))}
      </div>

      <InventoryKpiGrid
        items={[
          {
            label: "Today's revenue",
            value: formatPrice(todayKpis.grossRevenue),
            icon: DollarSign,
            mono: true,
            tone: "success",
          },
          { label: "Today's orders", value: String(todayKpis.orderCount), icon: ReceiptIcon, tone: "info" },
          {
            label: "Today's profit",
            value: formatPrice(todayKpis.netProfit),
            icon: TrendingUp,
            mono: true,
            tone: "accent",
          },
          {
            label: "Stock alerts",
            value: String(stockAlerts.low + stockAlerts.out),
            icon: Boxes,
            tone: stockAlerts.out > 0 ? "destructive" : stockAlerts.low > 0 ? "warning" : "default",
          },
        ]}
      />

      <RevenueCogsAreaChart points={weekTrend} />

      <div className="grid gap-4 lg:grid-cols-2">
        <RecentOrdersCard orders={recentOrders} />
        <LowStockCard products={products} categories={categories} velocityByProductId={velocityByProductId} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <TopProductsCard products={topProducts} />
        <CategoryOverviewCard categories={categories} productCountById={productCountById} />
      </div>

      {categories.length === 0 && products.length === 0 && (
        <Card size="sm">
          <CardContent className="flex flex-col items-center gap-2 py-8 text-center text-muted-foreground">
            <p className="text-sm">
              This store doesn&apos;t have any categories or products yet.
            </p>
            <Button size="sm" nativeButton={false} render={<Link href="/dashboard/categories" />}>
              Create your first category
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
