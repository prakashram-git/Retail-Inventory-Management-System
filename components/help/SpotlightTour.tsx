"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { autoUpdate, flip, offset, shift, useFloating } from "@floating-ui/react";
import { ChevronLeft, ChevronRight, FlaskConical, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import type { HelpWorkflow } from "@/lib/help/types";

interface SpotlightTourProps {
  workflow: HelpWorkflow;
  trainingMode: boolean;
  onTrainingModeChange: (on: boolean) => void;
  onExit: (completed: boolean, lastStepIndex: number) => void;
}

const PAD = 8;
const FIND_TIMEOUT_MS = 5000;

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function SpotlightTour({
  workflow,
  trainingMode,
  onTrainingModeChange,
  onExit,
}: SpotlightTourProps) {
  const [index, setIndex] = useState(0);
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [box, setBox] = useState<Box | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [mounted, setMounted] = useState(false);
  const step = workflow.steps[index];
  const last = index === workflow.steps.length - 1;

  useEffect(() => {
    // Portal target only exists after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const { refs, floatingStyles } = useFloating({
    placement: step?.placement ?? "bottom",
    middleware: [offset(PAD + 10), flip({ padding: 12 }), shift({ padding: 12 })],
    whileElementsMounted: autoUpdate,
    elements: { reference: target },
  });

  const next = useCallback(() => {
    if (last) onExit(true, index);
    else setIndex((i) => i + 1);
  }, [last, index, onExit]);
  const back = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);
  const exit = useCallback(() => onExit(false, index), [onExit, index]);

  // Locate the step's anchor; dialogs / routes may mount it a moment later.
  useEffect(() => {
    if (!step) return;
    let cancelled = false;
    const started = Date.now();
    const find = () => {
      if (cancelled) return;
      const el = document.querySelector<HTMLElement>(step.target_selector);
      if (el && el.getClientRects().length > 0) {
        el.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
        setTarget(el);
        return;
      }
      setTarget(null);
      setBox(null);
      if (Date.now() - started < FIND_TIMEOUT_MS) window.setTimeout(find, 200);
    };
    find();
    return () => {
      cancelled = true;
    };
  }, [step]);

  // Track the target's rect (scroll, resize, layout shifts).
  useEffect(() => {
    if (!target) return;
    const measure = () => {
      if (!target.isConnected) {
        setTarget(null);
        setBox(null);
        return;
      }
      const r = target.getBoundingClientRect();
      setBox((prev) =>
        prev && prev.x === r.x && prev.y === r.y && prev.w === r.width && prev.h === r.height
          ? prev
          : { x: r.x, y: r.y, w: r.width, h: r.height }
      );
    };
    measure();
    const id = window.setInterval(measure, 100);
    window.addEventListener("resize", measure);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("resize", measure);
    };
  }, [target]);

  // Move focus into the card whenever the step changes.
  useLayoutEffect(() => {
    cardRef.current?.querySelector<HTMLElement>("[data-tour-next]")?.focus();
  }, [index, mounted]);

  // Keyboard: Escape exits, ArrowRight/Enter next, ArrowLeft back, Tab trapped
  // in the card. Capture phase so an open Dialog doesn't also swallow Escape.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const t = event.target as HTMLElement | null;
      const typing = !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA");
      const card = cardRef.current;

      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        exit();
      } else if (event.key === "ArrowRight" && !typing) {
        event.preventDefault();
        next();
      } else if (event.key === "ArrowLeft" && !typing) {
        event.preventDefault();
        back();
      } else if (event.key === "Enter" && !typing && !(t && card?.contains(t) && t.tagName === "BUTTON")) {
        event.preventDefault();
        next();
      } else if (event.key === "Tab" && card) {
        const items = Array.from(card.querySelectorAll<HTMLElement>(FOCUSABLE));
        if (items.length === 0) return;
        const first = items[0];
        const lastItem = items[items.length - 1];
        const active = document.activeElement as HTMLElement | null;
        if (!active || !card.contains(active)) {
          event.preventDefault();
          first.focus();
        } else if (event.shiftKey && active === first) {
          event.preventDefault();
          lastItem.focus();
        } else if (!event.shiftKey && active === lastItem) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [exit, next, back]);

  if (!mounted || !step) return null;

  const cut = box
    ? { x: box.x - PAD, y: box.y - PAD, w: box.w + PAD * 2, h: box.h + PAD * 2 }
    : null;

  return createPortal(
    <div data-testid="spotlight-tour" className="pointer-events-none fixed inset-0 z-[200]">
      <svg className="absolute inset-0 size-full" aria-hidden>
        <defs>
          <mask id="tour-mask">
            <rect width="100%" height="100%" fill="white" />
            {cut && (
              <rect
                rx={12}
                fill="black"
                x={cut.x}
                y={cut.y}
                width={cut.w}
                height={cut.h}
                style={{
                  transition: "all 300ms cubic-bezier(0.4, 0, 0.2, 1)",
                  x: cut.x,
                  y: cut.y,
                  width: cut.w,
                  height: cut.h,
                }}
              />
            )}
          </mask>
        </defs>
        <rect
          width="100%"
          height="100%"
          fill="rgba(2, 6, 23, 0.62)"
          mask="url(#tour-mask)"
          style={{ transition: "opacity 300ms" }}
        />
        {cut && (
          <rect
            rx={12}
            fill="none"
            stroke="rgb(99, 102, 241)"
            strokeWidth={2}
            x={cut.x}
            y={cut.y}
            width={cut.w}
            height={cut.h}
            style={{
              transition: "all 300ms cubic-bezier(0.4, 0, 0.2, 1)",
              x: cut.x,
              y: cut.y,
              width: cut.w,
              height: cut.h,
            }}
          />
        )}
      </svg>

      <div
        ref={(node) => {
          cardRef.current = node;
          if (box) refs.setFloating(node);
        }}
        role="dialog"
        aria-modal="true"
        aria-label={`${workflow.title} — step ${index + 1} of ${workflow.steps.length}`}
        data-testid="spotlight-card"
        style={
          box
            ? floatingStyles
            : { position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)" }
        }
        className="pointer-events-auto w-[min(22rem,calc(100vw-1.5rem))] rounded-xl border bg-popover p-4 text-popover-foreground shadow-2xl"
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs font-medium text-muted-foreground">
              {workflow.title} · Step {index + 1} of {workflow.steps.length}
            </p>
            <h3 className="mt-0.5 text-base font-semibold">{step.title}</h3>
          </div>
          <button
            type="button"
            onClick={exit}
            aria-label="Exit tour (Esc)"
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <p className="mt-2 text-sm text-muted-foreground">{step.description}</p>
        {!box && (
          <p className="mt-2 rounded-md bg-muted px-2 py-1.5 text-xs text-muted-foreground">
            This element isn&apos;t on screen right now — it may be behind a dialog, on another
            page, or not available for your session.
          </p>
        )}

        <label className="mt-3 flex items-center justify-between gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-xs">
          <span className="flex items-center gap-1.5 font-medium">
            <FlaskConical className="size-3.5 text-amber-500" />
            Try it live (training sandbox)
          </span>
          <Switch
            checked={trainingMode}
            onCheckedChange={onTrainingModeChange}
            aria-label="Try it live training sandbox"
          />
        </label>

        <div className="mt-3 flex items-center justify-between">
          <div className="flex gap-1" aria-hidden>
            {workflow.steps.map((s, i) => (
              <span
                key={s.step_number}
                className={`h-1.5 w-4 rounded-full ${i === index ? "bg-primary" : "bg-muted"}`}
              />
            ))}
          </div>
          <div className="flex gap-1.5">
            <Button size="sm" variant="outline" onClick={back} disabled={index === 0}>
              <ChevronLeft />
              Back
            </Button>
            <Button size="sm" onClick={next} data-tour-next>
              {last ? "Finish" : "Next"}
              {!last && <ChevronRight />}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
