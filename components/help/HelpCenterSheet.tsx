"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import * as Icons from "lucide-react";
import { BookOpen, CheckCircle2, Clock, FlaskConical, Play, Search, TriangleAlert } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { fallbackIllustration } from "@/lib/help/illustrations";
import type { HelpWorkflow } from "@/lib/help/types";
import { useHelpCenter } from "./HelpCenterContext";

function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q) return <>{text}</>;
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escaped})`, "ig"));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === q.toLowerCase() ? (
          <mark key={i} className="rounded bg-yellow-300/70 px-0.5 text-foreground">
            {part}
          </mark>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        )
      )}
    </>
  );
}

function matches(wf: HelpWorkflow, q: string) {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return [wf.title, wf.summary, ...wf.steps.flatMap((s) => [s.title, s.description])].some((t) =>
    t.toLowerCase().includes(needle)
  );
}

function StepImage({ wf, stepIndex }: { wf: HelpWorkflow; stepIndex: number }) {
  const step = wf.steps[stepIndex];
  const [failed, setFailed] = useState(false);
  const desktop = !failed && step.desktop_image_url ? step.desktop_image_url : fallbackIllustration(step, wf.title);
  const mobile = !failed && step.mobile_image_url ? step.mobile_image_url : fallbackIllustration(step, wf.title, true);
  return (
    <picture>
      <source media="(max-width: 640px)" srcSet={mobile} />
      <img
        src={desktop}
        alt={`${wf.title}, step ${step.step_number}: ${step.title}`}
        loading="lazy"
        onError={() => setFailed(true)}
        className="w-full rounded-lg border"
      />
    </picture>
  );
}

export function HelpCenterSheet() {
  const {
    isOpen,
    closeHelp,
    activeWorkflowId,
    searchQuery: query,
    setSearchQuery: setQuery,
    payload,
    progress,
    startTour,
    trainingMode,
    setTrainingMode,
    role,
  } = useHelpCenter();
  const [reading, setReading] = useState<string | null>(null);

  // Deep link: openHelp("wf_x") expands that workflow and scrolls it into view.
  useEffect(() => {
    if (!isOpen || !activeWorkflowId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReading(activeWorkflowId);
    const t = window.setTimeout(
      () =>
        document
          .querySelector(`[data-testid="help-wf-${activeWorkflowId}"]`)
          ?.scrollIntoView({ block: "start", behavior: "smooth" }),
      250
    );
    return () => window.clearTimeout(t);
  }, [isOpen, activeWorkflowId]);

  const groups = useMemo(
    () =>
      payload.categories
        .map((category) => ({
          category,
          workflows: payload.workflows.filter((w) => w.category_id === category.id && matches(w, query)),
        }))
        .filter((g) => g.workflows.length > 0),
    [payload, query]
  );

  const showDrift = role === "super_admin" || role === "ui_designer";

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && closeHelp()}>
      <SheetContent
        className="w-full gap-0 bg-background/75 backdrop-blur-xl data-[side=right]:sm:max-w-md"
        data-testid="help-sheet"
      >
        <SheetHeader className="border-b">
          <SheetTitle className="flex items-center gap-2">
            <Icons.HelpCircle className="size-5 text-primary" />
            Help Center
          </SheetTitle>
          <SheetDescription>
            Guided tours and how-tos for your role. Press <kbd className="rounded border px-1 text-xs">F1</kbd>{" "}
            anytime. Works offline.
          </SheetDescription>
          <div className="relative mt-2">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search help — e.g. refund, scan, Z-report"
              aria-label="Search help"
              className="h-9 w-full rounded-lg border bg-background/60 pl-8 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <label className="mt-2 flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2 text-xs">
            <span className="flex items-center gap-1.5 font-medium">
              <FlaskConical className="size-3.5 text-amber-500" />
              Training sandbox — practice without saving anything
            </span>
            <Switch checked={trainingMode} onCheckedChange={setTrainingMode} aria-label="Training sandbox" />
          </label>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-4">
          {groups.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No help topics match &ldquo;{query}&rdquo;.
            </p>
          )}
          {groups.map(({ category, workflows }) => {
            const Icon =
              (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[category.icon] ??
              Icons.HelpCircle;
            return (
              <section key={category.id} className="mb-5">
                <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <Icon className="size-3.5" />
                  {category.title}
                </h3>
                <div className="flex flex-col gap-2">
                  {workflows.map((wf) => {
                    const done = progress[wf.id]?.completed;
                    const open = reading === wf.id;
                    return (
                      <article
                        key={wf.id}
                        data-testid={`help-wf-${wf.id}`}
                        className="rounded-xl border bg-card/70 p-3 shadow-xs"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="text-sm font-semibold">
                            <Highlight text={wf.title} query={query} />
                          </h4>
                          {done && <CheckCircle2 className="size-4 shrink-0 text-emerald-500" aria-label="Completed" />}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          <Highlight text={wf.summary} query={query} />
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <Badge variant="outline" className="gap-1 text-[10px]">
                            <Clock className="size-3" />
                            {wf.estimated_time_min} min
                          </Badge>
                          <Badge variant="outline" className="text-[10px]">
                            {wf.steps.length} steps
                          </Badge>
                          {showDrift && wf.drift_detected && (
                            <Badge className="gap-1 bg-amber-500/15 text-[10px] text-amber-700 dark:text-amber-400">
                              <TriangleAlert className="size-3" />
                              UI changes detected. Screenshots out of date.
                            </Badge>
                          )}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button size="sm" onClick={() => startTour(wf.id)}>
                            <Play />
                            Start Interactive Tour
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setReading(open ? null : wf.id)}>
                            <BookOpen />
                            {open ? "Hide summary" : "Read Summary & View Screenshots"}
                          </Button>
                        </div>
                        {open && (
                          <ol className="mt-3 flex flex-col gap-4 border-t pt-3">
                            {wf.steps.map((s, i) => (
                              <li key={s.step_number} className="flex flex-col gap-2">
                                <p className="text-sm font-medium">
                                  {s.step_number}. <Highlight text={s.title} query={query} />
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  <Highlight text={s.description} query={query} />
                                </p>
                                <StepImage wf={wf} stepIndex={i} />
                              </li>
                            ))}
                          </ol>
                        )}
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}
