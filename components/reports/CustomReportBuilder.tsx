"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowLeft,
  GripVertical,
  Eye,
  EyeOff,
  Play,
  Loader2,
  Download,
  FileSpreadsheet,
  FileText,
  Receipt,
  Braces,
  Save,
  Globe,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CustomDateRangePicker } from "@/components/dashboard/reports/CustomDateRangePicker";
import { getReportDefinition, type ReportColumn } from "@/lib/reports/catalog";
import { BUILDER_RANGE_PRESETS, getBuilderRangeBounds, type BuilderRangePreset } from "@/lib/reports/builderRanges";
import { executeReport, saveReportPreset, listReportPresets, type ReportPresetRow } from "@/lib/actions/reports";
import { exportToCsv, exportToExcel, exportToPdfA4, exportToPdfThermal, exportToJsonl } from "@/lib/reports/exporter";
import { cn } from "@/lib/utils";

interface CustomReportBuilderProps {
  reportId: string;
  onBack: () => void;
  isSuperAdmin: boolean;
  storeName: string;
  timezone: string;
}

export function CustomReportBuilder({ reportId, onBack, isSuperAdmin, storeName, timezone }: CustomReportBuilderProps) {
  const definition = getReportDefinition(reportId);
  const [rangePreset, setRangePreset] = useState<BuilderRangePreset>("today");
  const [customFrom, setCustomFrom] = useState<string | null>(null);
  const [customTo, setCustomTo] = useState<string | null>(null);
  const [allStores, setAllStores] = useState(false);
  const [groupBy, setGroupBy] = useState<string | undefined>(definition?.defaultGroupBy);
  const [columnOrder, setColumnOrder] = useState<string[]>(definition?.columns.map((c) => c.key) ?? []);
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set());
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null);
  const [isPending, startTransition] = useTransition();
  const [presets, setPresets] = useState<ReportPresetRow[]>([]);
  const [presetName, setPresetName] = useState("");
  const [savingPreset, setSavingPreset] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setColumnOrder(definition?.columns.map((c) => c.key) ?? []);
    setHiddenColumns(new Set());
    setGroupBy(definition?.defaultGroupBy);
    setRows(null);
    listReportPresets(reportId).then(setPresets).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportId]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  if (!definition) {
    return (
      <div className="flex flex-col items-center gap-3 py-12">
        <p className="text-sm text-destructive">Unknown report: {reportId}</p>
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft /> Back to library
        </Button>
      </div>
    );
  }

  // A fresh, definitely-typed binding — nested `function` declarations below
  // close over `definition` itself and TS won't carry the `!definition`
  // narrowing above into them, since it can't prove they run before any
  // hypothetical reassignment (even though `definition` is a `const`).
  const def: typeof definition = definition;
  const orderedColumns: ReportColumn[] = columnOrder
    .map((key) => def.columns.find((c) => c.key === key))
    .filter((c): c is ReportColumn => !!c);
  const visibleColumns = orderedColumns.filter((c) => !hiddenColumns.has(c.key));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setColumnOrder((prev) => {
      const oldIndex = prev.indexOf(String(active.id));
      const newIndex = prev.indexOf(String(over.id));
      return arrayMove(prev, oldIndex, newIndex);
    });
  }

  function toggleColumn(key: string) {
    setHiddenColumns((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function computeRange(): { from: Date; to: Date } {
    if (rangePreset === "custom" && customFrom && customTo) {
      return { from: new Date(`${customFrom}T00:00:00`), to: new Date(`${customTo}T23:59:59`) };
    }
    return getBuilderRangeBounds(rangePreset, timezone);
  }

  function runReport() {
    const { from, to } = computeRange();
    startTransition(async () => {
      try {
        const result = await executeReport({
          reportId,
          allStores: isSuperAdmin && allStores,
          startDate: from.toISOString(),
          endDate: to.toISOString(),
          groupBy,
        });
        setRows(result.rows);
        toast.success(`${result.rows.length} row${result.rows.length === 1 ? "" : "s"} returned`);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to run report");
      }
    });
  }

  function handleSavePreset() {
    if (!presetName.trim()) {
      toast.error("Name this configuration first");
      return;
    }
    startTransition(async () => {
      try {
        await saveReportPreset({
          reportId,
          name: presetName.trim(),
          selectedColumns: columnOrder.filter((k) => !hiddenColumns.has(k)),
          filters: {},
          groupBy: groupBy ?? null,
        });
        toast.success("Configuration saved");
        setPresetName("");
        setSavingPreset(false);
        setPresets(await listReportPresets(reportId));
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to save configuration");
      }
    });
  }

  function applyPreset(preset: ReportPresetRow) {
    const visible = new Set(preset.selected_columns);
    setColumnOrder([...preset.selected_columns, ...def.columns.map((c) => c.key).filter((k) => !visible.has(k))]);
    setHiddenColumns(new Set(def.columns.map((c) => c.key).filter((k) => !visible.has(k))));
    if (preset.group_by) setGroupBy(preset.group_by);
    toast.success(`Applied "${preset.name}"`);
  }

  function exportFilename(ext: string) {
    return `${reportId.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.${ext}`;
  }

  function handleExport(format: "csv" | "excel" | "pdf-a4" | "pdf-thermal" | "jsonl") {
    if (!rows || rows.length === 0) {
      toast.error("Run the report first");
      return;
    }
    switch (format) {
      case "csv":
        exportToCsv(visibleColumns, rows, exportFilename("csv"));
        break;
      case "excel":
        exportToExcel(visibleColumns, rows, exportFilename("xlsx"), def.title);
        break;
      case "pdf-a4":
        exportToPdfA4(visibleColumns, rows, { title: def.title, storeName, timezone }, exportFilename("pdf"));
        break;
      case "pdf-thermal":
        exportToPdfThermal(visibleColumns, rows, { title: def.title, storeName, timezone }, exportFilename("pdf"));
        break;
      case "jsonl":
        exportToJsonl(rows, exportFilename("jsonl"));
        break;
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft /> Report library
        </Button>
      </div>

      <div>
        <h2 className="text-lg font-semibold">{definition.title}</h2>
        <p className="text-sm text-muted-foreground">{definition.description}</p>
      </div>

      <Card size="sm">
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {BUILDER_RANGE_PRESETS.filter((p) => p.value !== "custom").map((p) => (
              <Button
                key={p.value}
                type="button"
                size="sm"
                variant={rangePreset === p.value ? "secondary" : "outline"}
                onClick={() => setRangePreset(p.value)}
              >
                {p.label}
              </Button>
            ))}
            <CustomDateRangePicker
              active={rangePreset === "custom"}
              from={customFrom}
              to={customTo}
              onApply={(from, to) => {
                setCustomFrom(from);
                setCustomTo(to);
                setRangePreset("custom");
              }}
            />

            {definition.groupByOptions && (
              <Select value={groupBy} onValueChange={(v) => setGroupBy(v ?? undefined)}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Group by" />
                </SelectTrigger>
                <SelectContent>
                  {definition.groupByOptions.map((g) => (
                    <SelectItem key={g} value={g}>
                      Group by {g}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {isSuperAdmin && (
              <div className="flex items-center gap-2 rounded-lg border px-3 py-1.5">
                <Globe className="size-4 text-muted-foreground" />
                <Label htmlFor="all-stores" className="text-sm">
                  All stores
                </Label>
                <Switch id="all-stores" checked={allStores} onCheckedChange={setAllStores} />
              </div>
            )}

            <Button onClick={runReport} disabled={isPending} className="ml-auto">
              {isPending ? <Loader2 className="animate-spin" /> : <Play />}
              Run report
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <Card size="sm">
          <CardHeader>
            <CardTitle>Columns</CardTitle>
            <CardDescription>Drag to reorder, toggle to show/hide.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <DndContext id="report-columns" sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={columnOrder} strategy={verticalListSortingStrategy}>
                {orderedColumns.map((col) => (
                  <SortableColumnRow
                    key={col.key}
                    column={col}
                    visible={!hiddenColumns.has(col.key)}
                    onToggle={() => toggleColumn(col.key)}
                  />
                ))}
              </SortableContext>
            </DndContext>

            <div className="mt-2 flex flex-col gap-2 border-t pt-3">
              {presets.length > 0 && (
                <Select onValueChange={(id) => { const p = presets.find((x) => x.id === id); if (p) applyPreset(p); }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Load saved configuration" />
                  </SelectTrigger>
                  <SelectContent>
                    {presets.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {savingPreset ? (
                <div className="flex gap-2">
                  <Input
                    placeholder="Configuration name"
                    value={presetName}
                    onChange={(e) => setPresetName(e.target.value)}
                    className="flex-1"
                  />
                  <Button size="sm" onClick={handleSavePreset} disabled={isPending}>
                    Save
                  </Button>
                </div>
              ) : (
                <Button variant="outline" size="sm" onClick={() => setSavingPreset(true)}>
                  <Save /> Save configuration
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <Card size="sm" className="flex flex-col">
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Results</CardTitle>
              <CardDescription>{rows ? `${rows.length} rows` : "Run the report to see results"}</CardDescription>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="outline" size="sm"><Download /> Export</Button>} />
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleExport("csv")}>
                  <FileText /> CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport("excel")}>
                  <FileSpreadsheet /> Excel (.xlsx)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport("pdf-a4")}>
                  <FileText /> PDF (A4 landscape)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport("pdf-thermal")}>
                  <Receipt /> PDF (80mm thermal)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport("jsonl")}>
                  <Braces /> JSONL
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </CardHeader>
          <CardContent>
            {isPending ? (
              <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Running...
              </div>
            ) : !rows ? (
              <p className="py-12 text-center text-sm text-muted-foreground">No results yet.</p>
            ) : rows.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">No data in this range.</p>
            ) : (
              <div className="max-h-[520px] overflow-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {visibleColumns.map((c) => (
                        <TableHead key={c.key} className={c.type === "currency" || c.type === "number" || c.type === "percent" ? "text-right" : undefined}>
                          {c.label}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.slice(0, 500).map((row, i) => (
                      <TableRow key={i}>
                        {visibleColumns.map((c) => (
                          <TableCell
                            key={c.key}
                            className={cn(
                              "text-sm",
                              (c.type === "currency" || c.type === "number" || c.type === "percent") && "text-right font-mono"
                            )}
                          >
                            {formatCell(row[c.key], c.type)}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function formatCell(value: unknown, type: ReportColumn["type"]): string {
  if (value == null) return "—";
  if (type === "currency" && typeof value === "number") return `$${value.toFixed(2)}`;
  if (type === "percent" && typeof value === "number") return `${value.toFixed(2)}%`;
  if (type === "datetime" && typeof value === "string") return new Date(value).toLocaleString();
  if (type === "date" && typeof value === "string") return new Date(value).toLocaleDateString();
  return String(value);
}

function SortableColumnRow({
  column,
  visible,
  onToggle,
}: {
  column: ReportColumn;
  visible: boolean;
  onToggle: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: column.key });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex items-center gap-2 rounded-lg border bg-card px-2 py-1.5",
        isDragging && "opacity-50",
        !visible && "opacity-50"
      )}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="flex cursor-grab items-center text-muted-foreground active:cursor-grabbing"
        aria-label={`Reorder ${column.label}`}
      >
        <GripVertical className="size-4" />
      </button>
      <span className="flex-1 truncate text-sm">{column.label}</span>
      <Button variant="ghost" size="icon-xs" onClick={onToggle}>
        {visible ? <Eye /> : <EyeOff />}
        <span className="sr-only">{visible ? "Hide" : "Show"}</span>
      </Button>
    </div>
  );
}
