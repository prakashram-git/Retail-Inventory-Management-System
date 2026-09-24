"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVertical,
  Eye,
  EyeOff,
  RotateCcw,
  Rocket,
  Monitor,
  Tablet,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { publishDashboardLayout, resetDashboardLayout } from "@/lib/actions/dashboard-layout";
import { WIDGET_CATALOG, packLayout } from "@/lib/dashboard/layout-types";
import type {
  DashboardWidgetConfig,
  DashboardThemeConfig,
  BorderRadiusStyle,
  WidgetSize,
} from "@/lib/dashboard/layout-types";
import { REPORT_CATALOG } from "@/lib/reports/catalog";
import { cn } from "@/lib/utils";

interface BuilderItem {
  id: string;
  visible: boolean;
  w: WidgetSize;
  config?: { reportId?: string };
}

const SIZE_STEPS: { value: WidgetSize; label: string; hint: string }[] = [
  { value: 3, label: "S", hint: "Compact" },
  { value: 6, label: "M", hint: "Standard" },
  { value: 12, label: "Full", hint: "Full-width" },
];

function nearestStep(w: number): WidgetSize {
  return SIZE_STEPS.reduce((closest, step) =>
    Math.abs(step.value - w) < Math.abs(closest - w) ? step.value : closest
  , SIZE_STEPS[0].value);
}

const RADIUS_PREVIEW: Record<BorderRadiusStyle, string> = {
  sharp: "4px",
  rounded: "16px",
  pill: "28px",
};

interface LayoutBuilderProps {
  initialLayoutConfig: DashboardWidgetConfig[];
  initialThemeConfig: DashboardThemeConfig;
  canEditGlobal: boolean;
  isCustom: boolean;
}

export function LayoutBuilder({
  initialLayoutConfig,
  initialThemeConfig,
  canEditGlobal,
  isCustom,
}: LayoutBuilderProps) {
  const [items, setItems] = useState<BuilderItem[]>(() =>
    [...initialLayoutConfig]
      .sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y))
      .map((w) => ({ id: w.id, visible: w.visible, w: nearestStep(w.w), config: w.config }))
  );
  const [theme, setTheme] = useState<DashboardThemeConfig>(initialThemeConfig);
  const [scope, setScope] = useState<"store" | "global">("store");
  const [previewWidth, setPreviewWidth] = useState<"desktop" | "tablet">("desktop");
  const [isPending, startTransition] = useTransition();

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setItems((prev) => {
      const oldIndex = prev.findIndex((i) => i.id === active.id);
      const newIndex = prev.findIndex((i) => i.id === over.id);
      return arrayMove(prev, oldIndex, newIndex);
    });
  }

  function toggleVisible(id: string) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, visible: !i.visible } : i)));
  }

  function setPinnedReport(id: string, reportId: string) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, config: { ...i.config, reportId } } : i)));
  }

  function setSize(id: string, w: WidgetSize) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, w } : i)));
  }

  function handlePublish() {
    const layoutConfig = packLayout(items);
    startTransition(async () => {
      try {
        await publishDashboardLayout({ layoutConfig, themeConfig: theme, scope });
        toast.success(
          scope === "global" ? "Mall-wide default layout published" : "Dashboard layout published"
        );
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to publish layout");
      }
    });
  }

  function handleReset() {
    startTransition(async () => {
      try {
        await resetDashboardLayout({ scope });
        toast.success("Reset to factory default");
        window.location.reload();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to reset layout");
      }
    });
  }

  const previewLayout = useMemo(() => packLayout(items), [items]);

  return (
    <div className="flex flex-col gap-3 text-sm">
      {/* One compact toolbar: the Settings layout above already carries the page title. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Drag to reorder, resize, hide and restyle the dashboard{" "}
          {scope === "global" ? "(mall-wide default)" : "(this store)"}.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {canEditGlobal && (
            <Select value={scope} onValueChange={(value) => setScope(value as "store" | "global")}>
              <SelectTrigger size="sm" className="w-40 text-xs" aria-label="Scope">
                <SelectValue>{scope === "store" ? "This store only" : "Mall-wide default"}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="store">This store only</SelectItem>
                <SelectItem value="global">Mall-wide default</SelectItem>
              </SelectContent>
            </Select>
          )}
          <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/dashboard" />}>
            <ExternalLink />
            Live
          </Button>
          <Button variant="outline" size="sm" onClick={handleReset} disabled={isPending}>
            <RotateCcw />
            Reset
          </Button>
          <Button size="sm" onClick={handlePublish} disabled={isPending} data-tour="layout-publish">
            <Rocket />
            {isPending ? "Publishing..." : "Publish changes"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] gap-3">
        <Card size="sm" data-tour="layout-widget-list" className="gap-2 py-2">
          <CardHeader className="px-3">
            <CardTitle className="text-sm">Widgets</CardTitle>
          </CardHeader>
          <CardContent className="max-h-[calc(100dvh-20rem)] min-h-40 overflow-y-auto px-3">
            <DndContext
              id="dashboard-layout-builder"
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                <div className="flex flex-col gap-1">
                  {items.map((item) => (
                    <SortableWidgetRow
                      key={item.id}
                      item={item}
                      onToggleVisible={() => toggleVisible(item.id)}
                      onSetSize={(w) => setSize(item.id, w)}
                      onSetReportId={(reportId) => setPinnedReport(item.id, reportId)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-3">
          <Card size="sm" data-tour="layout-theme" className="gap-2 py-2">
            <CardHeader className="px-3">
              <CardTitle className="text-sm">
                Theme
                {isCustom && (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">custom layout published</span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-x-4 gap-y-3 px-3 xl:grid-cols-2">
              <div className="flex flex-col gap-1">
                <Label htmlFor="accent-color" className="text-xs">Accent color</Label>
                <div className="flex items-center gap-2">
                  <input
                    id="accent-color"
                    type="color"
                    value={theme.accentColor}
                    onChange={(e) => setTheme((t) => ({ ...t, accentColor: e.target.value }))}
                    className="h-6 w-9 shrink-0 cursor-pointer rounded border"
                  />
                  <span className="font-mono text-[11px] text-muted-foreground">{theme.accentColor}</span>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <Label className="text-xs">Border radius</Label>
                <Select
                  value={theme.borderRadius}
                  onValueChange={(value) =>
                    setTheme((t) => ({ ...t, borderRadius: value as BorderRadiusStyle }))
                  }
                >
                  <SelectTrigger size="sm" className="text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sharp">Sharp</SelectItem>
                    <SelectItem value="rounded">Rounded</SelectItem>
                    <SelectItem value="pill">Pill</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Frosted glass</Label>
                  <span className="text-[11px] text-muted-foreground">{theme.glassOpacity}%</span>
                </div>
                <Slider
                  value={[theme.glassOpacity]}
                  min={10}
                  max={90}
                  step={5}
                  onValueChange={(value) =>
                    setTheme((t) => ({ ...t, glassOpacity: Array.isArray(value) ? value[0] : value }))
                  }
                />
              </div>

              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="mono-numbers" className="text-xs">Monospaced numbers</Label>
                <Switch
                  id="mono-numbers"
                  checked={theme.monoNumbers}
                  onCheckedChange={(checked) => setTheme((t) => ({ ...t, monoNumbers: checked }))}
                />
              </div>
            </CardContent>
          </Card>
          <Card size="sm" className="gap-2 py-2">
            <CardHeader className="flex-row items-center justify-between px-3">
              <CardTitle className="text-sm">Preview</CardTitle>
              <div className="flex gap-0.5 rounded-md bg-muted p-0.5">
                <Button
                  variant={previewWidth === "desktop" ? "default" : "ghost"}
                  size="icon-xs"
                  onClick={() => setPreviewWidth("desktop")}
                >
                  <Monitor />
                  <span className="sr-only">Desktop preview</span>
                </Button>
                <Button
                  variant={previewWidth === "tablet" ? "default" : "ghost"}
                  size="icon-xs"
                  onClick={() => setPreviewWidth("tablet")}
                >
                  <Tablet />
                  <span className="sr-only">Tablet preview</span>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="px-3">
              <div
                className={cn(
                  "mx-auto rounded-md border bg-muted/30 p-2 transition-all",
                  previewWidth === "tablet" ? "max-w-xs" : "max-w-full"
                )}
              >
                <div
                  className="grid gap-1"
                  style={{
                    gridTemplateColumns: `repeat(${previewWidth === "tablet" ? 6 : 12}, 1fr)`,
                  }}
                >
                  {previewLayout
                    .filter((w) => w.visible)
                    .map((widget) => {
                      const catalogEntry = WIDGET_CATALOG.find((c) => c.id === widget.id);
                      const span = previewWidth === "tablet" ? Math.min(6, widget.w) : widget.w;
                      return (
                        <div
                          key={widget.id}
                          className="flex h-6 items-center justify-center truncate border px-1 text-center text-[9px] font-medium text-muted-foreground"
                          style={{
                            gridColumn: `span ${span} / span ${span}`,
                            borderRadius: `calc(${RADIUS_PREVIEW[theme.borderRadius]} / 4)`,
                            backgroundColor: `color-mix(in oklch, white ${theme.glassOpacity}%, transparent)`,
                            borderLeft: `3px solid ${theme.accentColor}`,
                          }}
                        >
                          {catalogEntry?.label ?? widget.id}
                        </div>
                      );
                    })}
                </div>
              </div>
            </CardContent>
          </Card>

        </div>
      </div>
    </div>
  );
}

function SortableWidgetRow({
  item,
  onToggleVisible,
  onSetSize,
  onSetReportId,
}: {
  item: BuilderItem;
  onToggleVisible: () => void;
  onSetSize: (w: WidgetSize) => void;
  onSetReportId: (reportId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });
  const catalogEntry = WIDGET_CATALOG.find((c) => c.id === item.id);

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex items-center gap-2 rounded-md border bg-card px-2 py-1",
        isDragging && "opacity-50",
        !item.visible && "opacity-60"
      )}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="flex size-7 shrink-0 cursor-grab touch-none items-center justify-center text-muted-foreground active:cursor-grabbing"
        aria-label={`Reorder ${catalogEntry?.label ?? item.id}`}
      >
        <GripVertical className="size-4" />
      </button>

      <span
        className="min-w-0 flex-1 truncate text-xs font-medium"
        title={catalogEntry?.description}
      >
        {catalogEntry?.label ?? item.id}
      </span>

      {item.id === "widget_pinned_report" && (
        <Select value={item.config?.reportId ?? null} onValueChange={(v) => v && onSetReportId(v)}>
          <SelectTrigger size="sm" className="w-28 shrink-0 text-xs">
            <SelectValue placeholder="Choose a report" />
          </SelectTrigger>
          {/* Anchored below the trigger (not overlaid on it) and wide enough for the long report
              titles — otherwise the popup covers the row and clips names while the list scrolls. */}
          <SelectContent alignItemWithTrigger={false} align="end" className="max-h-72 min-w-72">
            {REPORT_CATALOG.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {r.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <div className="flex shrink-0 gap-0.5 rounded-md bg-muted p-0.5">
        {SIZE_STEPS.map((step) => (
          <button
            key={step.value}
            type="button"
            onClick={() => onSetSize(step.value)}
            title={step.hint}
            aria-label={`${step.hint} width`}
            className={cn(
              "rounded px-1.5 py-0.5 text-[11px] font-medium transition-colors",
              item.w === step.value
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {step.label}
          </button>
        ))}
      </div>

      <Button variant="ghost" size="icon-xs" onClick={onToggleVisible} className="shrink-0">
        {item.visible ? <Eye /> : <EyeOff />}
        <span className="sr-only">{item.visible ? "Hide" : "Show"} widget</span>
      </Button>
    </div>
  );
}
