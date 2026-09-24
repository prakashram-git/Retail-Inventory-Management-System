"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  DollarSign,
  TrendingUp,
  Plus,
  FolderPlus,
  ShoppingCart,
  BarChart3,
  Wallet,
  PackageMinus,
} from "lucide-react";
import { useStore } from "@/components/providers/StoreProvider";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MetricTile } from "./MetricTile";
import { RevenueCogsAreaChart } from "@/components/dashboard/reports/RevenueCogsAreaChart";
import {
  buildKpiSummary,
  buildRevenueVsCogsSeries,
  buildTopProducts,
  buildDeadInventory,
} from "@/lib/reports/aggregate";
import type { ReportsSaleLine, ReportsSaleTouch, StockMovementRow } from "@/lib/reports/types";
import type { Category, Product } from "@/lib/types/domain";
import type { OrderRow } from "@/lib/orders/types";
import type { DashboardWidgetConfig, DashboardThemeConfig, BorderRadiusStyle } from "@/lib/dashboard/layout-types";
import { RecentOrdersCard } from "./RecentOrdersCard";
import { LowStockCard } from "./LowStockCard";
import { TopProductsCard } from "./TopProductsCard";
import { CategoryOverviewCard } from "./CategoryOverviewCard";
import { DeadStockCard } from "./DeadStockCard";
import { ExecutiveDigest } from "@/components/dashboard/analytics/ExecutiveDigest";
import { CashierScorecard } from "@/components/dashboard/analytics/CashierScorecard";
import { DeadStockAgingCard } from "@/components/dashboard/analytics/DeadStockAgingCard";
import { HourlySalesHeatmap } from "@/components/dashboard/analytics/HourlySalesHeatmap";
import { SellThroughGauge } from "@/components/dashboard/analytics/SellThroughGauge";
import { PinnedReportCard } from "@/components/dashboard/analytics/PinnedReportCard";

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
  saleTouches: ReportsSaleTouch[];
  stockMovements: StockMovementRow[];
  layoutConfig: DashboardWidgetConfig[];
  themeConfig: DashboardThemeConfig;
}

const QUICK_ACTIONS = [
  { href: "/dashboard/inventory", label: "New product", icon: Plus },
  { href: "/dashboard/categories", label: "New category", icon: FolderPlus },
  { href: "/pos", label: "Open POS", icon: ShoppingCart },
  { href: "/dashboard/reports", label: "View reports", icon: BarChart3 },
];

const RADIUS_MAP: Record<BorderRadiusStyle, string> = {
  sharp: "4px",
  rounded: "16px",
  pill: "28px",
};

export function HomeDashboard({
  categories,
  products,
  todaySalesLines,
  weekSalesLines,
  recentOrders,
  timezone,
  velocityByProductId,
  saleTouches,
  stockMovements,
  layoutConfig,
  themeConfig,
}: HomeDashboardProps) {
  const { formatPrice } = useStore();

  const todayKpis = useMemo(
    () => buildKpiSummary(todaySalesLines, stockMovements),
    [todaySalesLines, stockMovements]
  );
  const weekTrend = useMemo(
    () => buildRevenueVsCogsSeries(weekSalesLines, timezone, "day"),
    [weekSalesLines, timezone]
  );
  const topProducts = useMemo(() => buildTopProducts(weekSalesLines, 5), [weekSalesLines]);
  const deadStock = useMemo(
    () => buildDeadInventory(products, saleTouches),
    [products, saleTouches]
  );

  const productCountById = useMemo(() => {
    const counts = new Map<string, number>();
    for (const product of products) {
      if (!product.category_id) continue;
      counts.set(product.category_id, (counts.get(product.category_id) ?? 0) + 1);
    }
    return counts;
  }, [products]);

  const widgetClassName = "dashboard-widget";
  const widgetStyle: React.CSSProperties = {};

  const widgetRegistry: Record<string, React.ReactNode> = {
    metric_gross_revenue: (
      <MetricTile
        label="Gross revenue"
        value={formatPrice(todayKpis.grossRevenue)}
        icon={DollarSign}
        tone="success"
        mono={themeConfig.monoNumbers}
        className={widgetClassName}
        style={widgetStyle}
      />
    ),
    metric_net_profit: (
      <MetricTile
        label="Net profit"
        value={formatPrice(todayKpis.netProfit)}
        icon={TrendingUp}
        tone="accent"
        mono={themeConfig.monoNumbers}
        className={widgetClassName}
        style={widgetStyle}
      />
    ),
    metric_aov: (
      <MetricTile
        label="Avg. order value"
        value={formatPrice(todayKpis.averageOrderValue)}
        icon={Wallet}
        tone="info"
        mono={themeConfig.monoNumbers}
        className={widgetClassName}
        style={widgetStyle}
      />
    ),
    metric_shrinkage: (
      <MetricTile
        label="Shrinkage"
        value={formatPrice(todayKpis.shrinkageValue)}
        icon={PackageMinus}
        tone={todayKpis.shrinkageValue > 0 ? "destructive" : "default"}
        mono={themeConfig.monoNumbers}
        className={widgetClassName}
        style={widgetStyle}
      />
    ),
    chart_revenue_vs_cogs: (
      <RevenueCogsAreaChart points={weekTrend} className={widgetClassName} style={widgetStyle} />
    ),
    widget_restock_alerts: (
      <LowStockCard
        products={products}
        categories={categories}
        velocityByProductId={velocityByProductId}
        className={widgetClassName}
        style={widgetStyle}
      />
    ),
    widget_recent_orders: (
      <RecentOrdersCard orders={recentOrders} className={widgetClassName} style={widgetStyle} />
    ),
    widget_dead_stock: <DeadStockCard rows={deadStock} className={widgetClassName} style={widgetStyle} />,
    widget_executive_digest: <ExecutiveDigest className={widgetClassName} style={widgetStyle} />,
    widget_cashier_leaderboard: <CashierScorecard className={widgetClassName} style={widgetStyle} />,
    widget_dead_stock_aging: <DeadStockAgingCard className={widgetClassName} style={widgetStyle} />,
    widget_hourly_heatmap: <HourlySalesHeatmap className={widgetClassName} style={widgetStyle} />,
    widget_sell_through: <SellThroughGauge className={widgetClassName} style={widgetStyle} />,
    widget_pinned_report: (
      <PinnedReportCard
        reportId={layoutConfig.find((w) => w.id === "widget_pinned_report")?.config?.reportId ?? "REP-SALES-01"}
        className={widgetClassName}
        style={widgetStyle}
      />
    ),
  };

  const visibleWidgets = layoutConfig
    .filter((w) => w.visible && widgetRegistry[w.id])
    .sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y));

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

      <div
        className="grid grid-cols-12 gap-4"
        style={
          {
            "--widget-radius": RADIUS_MAP[themeConfig.borderRadius],
            "--widget-bg-alpha": `${themeConfig.glassOpacity}%`,
            "--widget-accent": themeConfig.accentColor,
          } as React.CSSProperties
        }
      >
        {visibleWidgets.map((widget) => (
          <div key={widget.id} className="col-span-12" style={{ gridColumn: `span ${widget.w} / span ${widget.w}` }}>
            {widgetRegistry[widget.id]}
          </div>
        ))}
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
