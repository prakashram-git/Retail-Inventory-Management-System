"use client";

import { useEffect, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Download, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useStore } from "@/components/providers/StoreProvider";
import { getExecutiveDigest, getWindowDigest } from "@/lib/actions/analytics";
import { cn } from "@/lib/utils";
import type { ExecutiveDigest as ExecutiveDigestData, ExecutiveDigestDaily } from "@/lib/analytics/types";
import { EXECUTIVE_KPI_LABELS, isExecutiveKpiEnabled, type StoreFeatures } from "@/lib/profiles/types";

type Segment = "today" | "mtd" | "30d";

interface KpiSpec {
  label: string;
  value: number;
  format: "currency" | "number" | "percent";
  deltaPct?: number | null;
  deltaLabel?: string;
  invertDelta?: boolean;
}

function DeltaTag({ pct, invert, label }: { pct: number; invert?: boolean; label?: string }) {
  const isFlat = Math.abs(pct) < 0.05;
  const isUp = pct > 0;
  const isGood = isFlat ? null : invert ? !isUp : isUp;
  return (
    <span
      className={cn(
        "flex items-center gap-0.5 text-[10px] font-medium",
        isFlat && "text-muted-foreground",
        isGood === true && "text-emerald-600 dark:text-emerald-400",
        isGood === false && "text-destructive"
      )}
    >
      {!isFlat && (isUp ? <ArrowUp className="size-2.5" /> : <ArrowDown className="size-2.5" />)}
      {isFlat ? "Flat" : `${Math.abs(pct).toFixed(1)}%`}
      {label && <span className="font-normal text-muted-foreground">{label}</span>}
    </span>
  );
}

function KpiCard({ spec, formatPrice }: { spec: KpiSpec; formatPrice: (n: number) => string }) {
  const displayValue =
    spec.format === "currency"
      ? formatPrice(spec.value)
      : spec.format === "percent"
        ? `${spec.value.toFixed(2)}%`
        : spec.value.toLocaleString();

  return (
    <Card size="sm" className="data-[size=sm]:[--card-spacing:--spacing(1.5)]">
      <CardContent className="flex flex-col gap-0 leading-tight">
        <span className="truncate text-[10px] text-muted-foreground" title={spec.label}>{spec.label}</span>
        <span className="font-mono text-sm font-semibold">{displayValue}</span>
        {spec.deltaPct != null && <DeltaTag pct={spec.deltaPct} invert={spec.invertDelta} label={spec.deltaLabel} />}
      </CardContent>
    </Card>
  );
}

function csvEscape(value: string | number): string {
  const str = String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function downloadCsv(daily: ExecutiveDigestDaily, targetDate: string) {
  const rows = [
    ["Metric", "Value"],
    ["Date", targetDate],
    ["Gross sales", daily.gross_sales],
    ["Net sales", daily.net_sales],
    ["Order count", daily.order_count],
    ["AOV", daily.aov],
    ["UPT", daily.upt],
    ["COGS", daily.cogs],
    ["Gross profit", daily.gross_profit],
    ["Gross margin %", daily.gross_margin_pct],
    ["Discount total", daily.discount_total],
    ["Discount leakage %", daily.discount_leakage_pct],
    ["Tax collected", daily.tax_collected],
  ];
  const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `flash-digest-${targetDate}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function ExecutiveDigest({
  className,
  style,
  features,
}: {
  className?: string;
  style?: React.CSSProperties;
  features: StoreFeatures;
}) {
  const { formatPrice } = useStore();
  const [segment, setSegment] = useState<Segment>("today");
  const [digest, setDigest] = useState<ExecutiveDigestData | null>(null);
  const [windowDaily, setWindowDaily] = useState<ExecutiveDigestDaily | null>(null);
  const [isPending, startTransition] = useTransition();
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    startTransition(async () => {
      setLoadError(null);
      try {
        if (segment === "30d") {
          setWindowDaily(await getWindowDigest(30));
        } else {
          const targetDate = new Date().toLocaleDateString("en-CA");
          setDigest(await getExecutiveDigest(targetDate));
        }
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : "Failed to load the digest");
      }
    });
  }, [segment]);

  const daily: ExecutiveDigestDaily | null =
    segment === "30d" ? windowDaily : segment === "today" ? (digest?.daily ?? null) : null;

  const targetDateLabel = digest?.target_date ?? new Date().toLocaleDateString("en-CA");

  /**
   * Opens a self-contained print window rather than relying on the shared
   * @media print rules in globals.css — those are already scoped to
   * #receipt-print-area with an 80mm @page size for POS receipts, and
   * @page rules aren't scopable per-element, so reusing that block here
   * would force this report onto receipt-width paper (and vice versa).
   */
  function handlePrint() {
    if (!daily) {
      toast.error("Nothing to export yet");
      return;
    }
    const win = window.open("", "_blank", "width=800,height=900");
    if (!win) {
      toast.error("Pop-up blocked — allow pop-ups to download the Flash PDF");
      return;
    }
    const rows: [string, string][] = [
      ["Gross sales", formatPrice(daily.gross_sales)],
      ["Net sales", formatPrice(daily.net_sales)],
      ["Order count", daily.order_count.toLocaleString()],
      ["AOV", formatPrice(daily.aov)],
      ["UPT", daily.upt.toFixed(2)],
      ["COGS", formatPrice(daily.cogs)],
      ["Gross profit", formatPrice(daily.gross_profit)],
      ["Gross margin", `${daily.gross_margin_pct.toFixed(2)}%`],
      ["Discount total", formatPrice(daily.discount_total)],
      ["Discount leakage", `${daily.discount_leakage_pct.toFixed(2)}%`],
      ["Tax collected", formatPrice(daily.tax_collected)],
    ];
    win.document.write(`<!doctype html><html><head><title>Flash Digest — ${targetDateLabel}</title>
      <style>
        body { font-family: -apple-system, Arial, sans-serif; padding: 32px; color: #1a1a1a; }
        h1 { font-size: 20px; margin-bottom: 4px; }
        p.subtitle { color: #666; margin-top: 0; margin-bottom: 24px; }
        table { width: 100%; border-collapse: collapse; }
        td { padding: 8px 0; border-bottom: 1px solid #e5e5e5; }
        td:last-child { text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; }
      </style></head><body>
      <h1>Flash Daily Digest</h1>
      <p class="subtitle">${targetDateLabel} · ${segment === "30d" ? "Last 30 days" : "Today"}</p>
      <table>${rows.map(([label, value]) => `<tr><td>${label}</td><td>${value}</td></tr>`).join("")}</table>
      </body></html>`);
    win.document.close();
    win.focus();
    win.print();
  }

  function handleCsv() {
    if (!daily) {
      toast.error("Nothing to export yet");
      return;
    }
    downloadCsv(daily, targetDateLabel);
  }

  return (
    <Card size="sm" className={cn("flex flex-col", className)} style={style}>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
        <div>
          <CardTitle>Executive digest</CardTitle>
          <CardDescription>
            Flash daily, month-to-date, and rolling 30-day performance
          </CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Tabs value={segment} onValueChange={(v) => setSegment(v as Segment)}>
            <TabsList>
              <TabsTrigger value="today">Today (Flash Daily)</TabsTrigger>
              <TabsTrigger value="mtd">Month-to-Date</TabsTrigger>
              <TabsTrigger value="30d">Last 30 Days</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button variant="outline" size="sm" onClick={handlePrint}>
            <FileText /> Flash PDF
          </Button>
          <Button variant="outline" size="sm" onClick={handleCsv}>
            <Download /> CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {isPending && (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading...
          </div>
        )}
        {loadError && <p className="py-4 text-center text-sm text-destructive">{loadError}</p>}

        {!isPending && !loadError && segment === "mtd" && digest && (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard spec={{ label: "MTD net sales", value: digest.mtd.net_sales, format: "currency" }} formatPrice={formatPrice} />
            <KpiCard
              spec={{
                label: "MTD vs. last month",
                value: digest.mtd.net_sales,
                format: "currency",
                deltaPct: digest.mtd.mom_growth_pct,
                deltaLabel: "vs same span",
              }}
              formatPrice={formatPrice}
            />
            <KpiCard spec={{ label: "MTD gross margin", value: digest.mtd.gross_margin_pct, format: "percent" }} formatPrice={formatPrice} />
            <KpiCard spec={{ label: "MTD refunds", value: digest.mtd.refunds_total, format: "currency" }} formatPrice={formatPrice} />
            <KpiCard spec={{ label: "MTD COGS", value: digest.mtd.cogs, format: "currency" }} formatPrice={formatPrice} />
            <KpiCard
              spec={{ label: "Projected month-end", value: digest.mtd.projected_month_end, format: "currency" }}
              formatPrice={formatPrice}
            />
            <KpiCard
              spec={{ label: "Days elapsed", value: digest.mtd.days_elapsed, format: "number" }}
              formatPrice={formatPrice}
            />
            <KpiCard
              spec={{ label: "Days in month", value: digest.mtd.days_in_month, format: "number" }}
              formatPrice={formatPrice}
            />
          </div>
        )}

        {!isPending && !loadError && daily && segment !== "mtd" && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
            {(
              [
                {
                  id: "kpi_gross_sales",
                  spec: {
                    label: EXECUTIVE_KPI_LABELS.kpi_gross_sales,
                    value: daily.gross_sales,
                    format: "currency",
                    deltaPct: segment === "today" ? daily.dod_delta_pct : undefined,
                    deltaLabel: "vs yesterday",
                  },
                },
                {
                  id: "kpi_net_sales",
                  spec: {
                    label: EXECUTIVE_KPI_LABELS.kpi_net_sales,
                    value: daily.net_sales,
                    format: "currency",
                    deltaPct: segment === "today" ? daily.wow_delta_pct : undefined,
                    deltaLabel: "vs last week",
                  },
                },
                { id: "kpi_upt", spec: { label: EXECUTIVE_KPI_LABELS.kpi_upt, value: daily.upt, format: "number" } },
                { id: "kpi_aov", spec: { label: EXECUTIVE_KPI_LABELS.kpi_aov, value: daily.aov, format: "currency" } },
                {
                  id: "kpi_discount_leakage",
                  spec: { label: EXECUTIVE_KPI_LABELS.kpi_discount_leakage, value: daily.discount_leakage_pct, format: "percent", deltaPct: null },
                },
                {
                  id: "kpi_margin_loss",
                  spec: { label: EXECUTIVE_KPI_LABELS.kpi_margin_loss, value: daily.discount_total, format: "currency" },
                },
                {
                  id: "kpi_gross_profit",
                  spec: { label: EXECUTIVE_KPI_LABELS.kpi_gross_profit, value: daily.gross_profit, format: "currency" },
                },
                {
                  id: "kpi_gross_margin",
                  spec: { label: EXECUTIVE_KPI_LABELS.kpi_gross_margin, value: daily.gross_margin_pct, format: "percent" },
                },
              ] satisfies { id: string; spec: KpiSpec }[]
            )
              .filter((kpi) => isExecutiveKpiEnabled(features, kpi.id))
              .map((kpi) => (
                <KpiCard key={kpi.id} spec={kpi.spec} formatPrice={formatPrice} />
              ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
