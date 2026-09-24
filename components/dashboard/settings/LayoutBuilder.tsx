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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import { cn } from "@/lib/utils";

interface BuilderItem {
  id: string;
  visible: boolean;
  w: WidgetSize;
}

const SIZE_STEPS: { value: WidgetSize; label: string }[] = [
  { value: 3, label: "Compact" },
  { value: 6, label: "Standard" },
  { value: 12, label: "Full-width" },
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
      .map((w) => ({ id: w.id, visible: w.visible, w: nearestStep(w.w) }))
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
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Layout builder</h1>
          <p className="text-sm text-muted-foreground">
            Drag to reorder, toggle visibility, resize, and restyle the dashboard{" "}
            {scope === "global" ? "mall-wide default" : "for your store"}.
          </p>
        </div>
        <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/dashboard" />}>
          <ExternalLink />
          View live dashboard
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-4">
          <Card size="sm">
            <CardHeader>
              <CardTitle>Widgets</CardTitle>
              <CardDescription>Drag the handle to reorder. Order flows left-to-right, top-to-bottom.</CardDescription>
            </CardHeader>
            <CardContent>
              <DndContext
                id="dashboard-layout-builder"
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                  <div className="flex flex-col gap-2">
                    {items.map((item) => (
                      <SortableWidgetRow
                        key={item.id}
                        item={item}
                        onToggleVisible={() => toggleVisible(item.id)}
                        onSetSize={(w) => setSize(item.id, w)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </CardContent>
          </Card>

          <Card size="sm">
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle>Preview</CardTitle>
                <CardDescription>A simplified mock — the real dashboard uses live data.</CardDescription>
              </div>
              <div className="flex gap-1 rounded-lg bg-muted p-1">
                <Button
                  variant={previewWidth === "desktop" ? "default" : "ghost"}
                  size="icon-sm"
                  onClick={() => setPreviewWidth("desktop")}
                >
                  <Monitor />
                  <span className="sr-only">Desktop preview</span>
                </Button>
                <Button
                  variant={previewWidth === "tablet" ? "default" : "ghost"}
                  size="icon-sm"
                  onClick={() => setPreviewWidth("tablet")}
                >
                  <Tablet />
                  <span className="sr-only">Tablet preview</span>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div
                className={cn(
                  "mx-auto rounded-lg border bg-muted/30 p-4 transition-all",
                  previewWidth === "tablet" ? "max-w-xl" : "max-w-full"
                )}
              >
                <div
                  className="grid gap-2"
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
                          className="flex h-16 items-center justify-center border px-2 text-center text-xs font-medium text-muted-foreground"
                          style={{
                            gridColumn: `span ${span} / span ${span}`,
                            borderRadius: RADIUS_PREVIEW[theme.borderRadius],
                            backgroundColor: `color-mix(in oklch, white ${theme.glassOpacity}%, transparent)`,
                            borderLeft: `4px solid ${theme.accentColor}`,
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

        <div className="flex flex-col gap-4">
          <Card size="sm">
            <CardHeader>
              <CardTitle>Theme</CardTitle>
              {isCustom && <CardDescription>A custom layout is currently published.</CardDescription>}
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="accent-color">Accent color</Label>
                <div className="flex items-center gap-2">
                  <input
                    id="accent-color"
                    type="color"
                    value={theme.accentColor}
                    onChange={(e) => setTheme((t) => ({ ...t, accentColor: e.target.value }))}
                    className="h-8 w-12 shrink-0 cursor-pointer rounded border"
                  />
                  <span className="font-mono text-xs text-muted-foreground">{theme.accentColor}</span>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <Label>Frosted glass opacity</Label>
                  <span className="text-xs text-muted-foreground">{theme.glassOpacity}%</span>
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

              <div className="flex flex-col gap-1.5">
                <Label>Border radius</Label>
                <Select
                  value={theme.borderRadius}
                  onValueChange={(value) =>
                    setTheme((t) => ({ ...t, borderRadius: value as BorderRadiusStyle }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sharp">Sharp</SelectItem>
                    <SelectItem value="rounded">Rounded</SelectItem>
                    <SelectItem value="pill">Pill</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="mono-numbers">Monospaced financial numbers</Label>
                <Switch
                  id="mono-numbers"
                  checked={theme.monoNumbers}
                  onCheckedChange={(checked) => setTheme((t) => ({ ...t, monoNumbers: checked }))}
                />
              </div>
            </CardContent>
          </Card>

          {canEditGlobal && (
            <Card size="sm">
              <CardHeader>
                <CardTitle>Scope</CardTitle>
                <CardDescription>Who does this change apply to?</CardDescription>
              </CardHeader>
              <CardContent>
                <Select value={scope} onValueChange={(value) => setScope(value as "store" | "global")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="store">This store only</SelectItem>
                    <SelectItem value="global">Mall-wide default</SelectItem>
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>
          )}

          <div className="flex flex-col gap-2">
            <Button onClick={handlePublish} disabled={isPending}>
              <Rocket />
              {isPending ? "Publishing..." : "Publish changes"}
            </Button>
            <Button variant="outline" onClick={handleReset} disabled={isPending}>
              <RotateCcw />
              Reset to factory default
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SortableWidgetRow({
  item,
  onToggleVisible,
  onSetSize,
}: {
  item: BuilderItem;
  onToggleVisible: () => void;
  onSetSize: (w: WidgetSize) => void;
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
        "flex items-center gap-3 rounded-lg border bg-card p-3",
        isDragging && "opacity-50",
        !item.visible && "opacity-60"
      )}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="touch-target flex cursor-grab items-center justify-center text-muted-foreground active:cursor-grabbing"
        aria-label={`Reorder ${catalogEntry?.label ?? item.id}`}
      >
        <GripVertical className="size-4" />
      </button>

      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium">{catalogEntry?.label ?? item.id}</span>
        <span className="truncate text-xs text-muted-foreground">{catalogEntry?.description}</span>
      </div>

      <div className="flex shrink-0 gap-1 rounded-lg bg-muted p-1">
        {SIZE_STEPS.map((step) => (
          <button
            key={step.value}
            type="button"
            onClick={() => onSetSize(step.value)}
            className={cn(
              "rounded-md px-2 py-1 text-xs font-medium transition-colors",
              item.w === step.value
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {step.label}
          </button>
        ))}
      </div>

      <Button variant="ghost" size="icon-sm" onClick={onToggleVisible} className="shrink-0">
        {item.visible ? <Eye /> : <EyeOff />}
        <span className="sr-only">{item.visible ? "Hide" : "Show"} widget</span>
      </Button>
    </div>
  );
}
