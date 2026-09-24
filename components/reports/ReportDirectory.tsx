"use client";

import { useMemo, useState } from "react";
import { Search, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { REPORT_CATALOG, PILLAR_LABEL, type ReportPillar } from "@/lib/reports/catalog";

type PillarFilter = ReportPillar | "all";

const PILLAR_TABS: { value: PillarFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "sales", label: "Sales" },
  { value: "inventory", label: "Inventory" },
  { value: "finance", label: "Finance" },
  { value: "audit", label: "Audit" },
  { value: "staff", label: "Staff" },
];

export function ReportDirectory({ onSelectReport }: { onSelectReport: (reportId: string) => void }) {
  const [pillar, setPillar] = useState<PillarFilter>("all");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return REPORT_CATALOG.filter((r) => {
      if (pillar !== "all" && r.pillar !== pillar) return false;
      if (query && !`${r.title} ${r.description} ${r.id}`.toLowerCase().includes(query)) return false;
      return true;
    });
  }, [pillar, search]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={pillar} onValueChange={(v) => setPillar(v as PillarFilter)}>
          <TabsList>
            {PILLAR_TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <InputGroup className="sm:max-w-64">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            placeholder="Search reports"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </InputGroup>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((report) => (
          <Card
            key={report.id}
            size="sm"
            className="cursor-pointer transition-shadow hover:shadow-md"
            onClick={() => onSelectReport(report.id)}
          >
            <CardContent className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <Badge variant="outline" className="font-mono text-[10px]">
                  {report.id}
                </Badge>
                <ChevronRight className="size-4 text-muted-foreground" />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium">{report.title}</span>
                <span className="text-xs text-muted-foreground">{report.description}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{report.columns.length} columns</span>
                <span>·</span>
                <span>{PILLAR_LABEL[report.pillar]}</span>
              </div>
            </CardContent>
          </Card>
        ))}
        {filtered.length === 0 && (
          <p className="col-span-full py-8 text-center text-sm text-muted-foreground">
            No reports match this filter.
          </p>
        )}
      </div>
    </div>
  );
}
