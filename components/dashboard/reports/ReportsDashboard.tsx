"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { Download, DollarSign, TrendingUp, Receipt as ReceiptIcon, TriangleAlert } from "lucide-react";
import { useStore } from "@/components/providers/StoreProvider";
import { TimeRangePicker } from "@/components/dashboard/TimeRangePicker";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { InventoryKpiGrid } from "@/components/dashboard/inventory/InventoryKpiGrid";
import {
  buildCategoryRevenue,
  buildDeadInventory,
  buildHourlyVelocity,
  buildKpiSummary,
  buildRevenueVsCogsSeries,
} from "@/lib/reports/aggregate";
import { downloadCsv, toCsv } from "@/lib/reports/csv";
import { REPORT_RANGE_PRESETS, type ReportRangePreset } from "@/lib/reports/timezone";
import { CategoryRevenueDonut } from "./CategoryRevenueDonut";
import { RevenueCogsAreaChart } from "./RevenueCogsAreaChart";
import { HourlyVelocityChart } from "./HourlyVelocityChart";
import { DeadInventoryTable } from "./DeadInventoryTable";
import { TillSessionsTable } from "./TillSessionsTable";
import { StockMovementsTable } from "./StockMovementsTable";
import type {
  ReportsCategory,
  ReportsProduct,
  ReportsSaleLine,
  ReportsSaleTouch,
  StockMovementRow,
  TillSessionRow,
} from "@/lib/reports/types";

interface ReportsDashboardProps {
  salesLines: ReportsSaleLine[];
  categories: ReportsCategory[];
  products: ReportsProduct[];
  saleTouches: ReportsSaleTouch[];
  stockMovements: StockMovementRow[];
  tillSessions: TillSessionRow[];
  range: ReportRangePreset;
  timezone: string;
}

export function ReportsDashboard({
  salesLines,
  categories,
  products,
  saleTouches,
  stockMovements,
  tillSessions,
  range,
  timezone,
}: ReportsDashboardProps) {
  const router = useRouter();
  const { formatPrice } = useStore();

  const kpis = useMemo(
    () => buildKpiSummary(salesLines, stockMovements),
    [salesLines, stockMovements]
  );
  const categorySlices = useMemo(
    () => buildCategoryRevenue(salesLines, categories),
    [salesLines, categories]
  );
  const areaPoints = useMemo(
    () => buildRevenueVsCogsSeries(salesLines, timezone, range === "today" ? "hour" : "day"),
    [salesLines, timezone, range]
  );
  const hourlyPoints = useMemo(
    () => buildHourlyVelocity(salesLines, timezone),
    [salesLines, timezone]
  );
  const deadInventory = useMemo(
    () => buildDeadInventory(products, saleTouches),
    [products, saleTouches]
  );

  function setRange(next: ReportRangePreset) {
    router.replace(`/dashboard/reports?range=${next}`);
  }

  function exportSalesCsv() {
    const csv = toCsv(
      salesLines.map((line) => ({
        invoice_number: line.invoice_number,
        date: line.created_at,
        sku: line.product_sku,
        product: line.product_name,
        quantity: line.quantity,
        refunded_quantity: line.refunded_quantity,
        unit_price: line.unit_price,
        line_total: (line.quantity - line.refunded_quantity) * line.unit_price,
      })),
      ["invoice_number", "date", "sku", "product", "quantity", "refunded_quantity", "unit_price", "line_total"]
    );
    downloadCsv(`sales-${range}-${Date.now()}.csv`, csv);
  }

  function exportStockMovementCsv() {
    const csv = toCsv(stockMovements, [
      "created_at",
      "change_type",
      "product_sku",
      "product_name",
      "quantity",
      "previous_stock",
      "new_stock",
      "cost_price",
      "notes",
    ]);
    downloadCsv(`stock-movements-${range}-${Date.now()}.csv`, csv);
  }

  function exportTillSessionsCsv() {
    const csv = toCsv(tillSessions, [
      "cashier_name",
      "opened_at",
      "closed_at",
      "opening_float",
      "expected_cash",
      "closing_counted_cash",
      "discrepancy",
      "status",
    ]);
    downloadCsv(`till-sessions-${range}-${Date.now()}.csv`, csv);
  }

  return (
    <div className="flex flex-col gap-4">
      <Card size="sm">
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <TimeRangePicker value={range} onChange={setRange} presets={REPORT_RANGE_PRESETS} />
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={exportSalesCsv}>
              <Download />
              Export sales CSV
            </Button>
            <Button variant="outline" size="sm" onClick={exportStockMovementCsv}>
              <Download />
              Export stock movement CSV
            </Button>
            <Button variant="outline" size="sm" onClick={exportTillSessionsCsv}>
              <Download />
              Export till sessions CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      <InventoryKpiGrid
        items={[
          { label: "Gross revenue", value: formatPrice(kpis.grossRevenue), icon: DollarSign, mono: true },
          { label: "Net profit", value: formatPrice(kpis.netProfit), icon: TrendingUp, mono: true },
          {
            label: "Average order value",
            value: formatPrice(kpis.averageOrderValue),
            icon: ReceiptIcon,
            mono: true,
          },
          {
            label: "Shrinkage / variance",
            value: formatPrice(kpis.shrinkageValue),
            icon: TriangleAlert,
            tone: "destructive",
            mono: true,
          },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <CategoryRevenueDonut slices={categorySlices} />
        <HourlyVelocityChart points={hourlyPoints} timezoneLabel={timezone} />
      </div>

      <RevenueCogsAreaChart points={areaPoints} />

      <TillSessionsTable rows={tillSessions} />

      <StockMovementsTable rows={stockMovements} />

      <DeadInventoryTable rows={deadInventory} categories={categories} />
    </div>
  );
}
