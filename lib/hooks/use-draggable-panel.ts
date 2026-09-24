"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

interface Offset {
  x: number;
  y: number;
}

const KEY_STEP = 24;

function readStored(key: string): Offset {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw) as Offset;
      if (Number.isFinite(parsed.x) && Number.isFinite(parsed.y)) return parsed;
    }
  } catch {
    /* storage unavailable (private mode) — start centred */
  }
  return { x: 0, y: 0 };
}

/**
 * Lets a centred, fixed-position panel be moved by dragging a handle (pointer) or pressing
 * the arrow keys on it (keyboard). The offset is applied through the CSS `translate`
 * property (callers add it to the panel's own -50% centring). It is clamped
 * so the handle can never leave the viewport, remembered per `storageKey`, and reset by
 * double-click / Home.
 */
export function useDraggablePanel(storageKey: string, active: boolean) {
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 });
  const drag = useRef<{ startX: number; startY: number; origin: Offset } | null>(null);
  const lastDragEnd = useRef(0);

  useEffect(() => {
    // localStorage only exists in the browser, so it can't seed the initial state during SSR.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (active) setOffset(readStored(storageKey));
  }, [active, storageKey]);

  const persist = useCallback(
    (next: Offset) => {
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        /* ignore */
      }
    },
    [storageKey]
  );

  // The panel is centred at offset 0. Keep its top edge (where the handle is) on screen, and keep
  // at least KEEP px of it reachable on every other side.
  const KEEP = 64;
  const clamp = useCallback((o: Offset, size: { w: number; h: number }): Offset => {
    const slackX = (window.innerWidth - size.w) / 2;
    const slackY = (window.innerHeight - size.h) / 2;
    const minX = -(slackX + size.w - KEEP);
    const maxX = slackX + size.w - KEEP;
    const minY = -slackY;
    const maxY = slackY + size.h - 40;
    return { x: Math.min(maxX, Math.max(minX, o.x)), y: Math.min(maxY, Math.max(minY, o.y)) };
  }, []);
  const sizeOf = (el: HTMLElement) => {
    const panel = el.parentElement ?? el;
    return { w: panel.offsetWidth, h: panel.offsetHeight };
  };

  const handleProps = {
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      if ((e.target as HTMLElement).closest("button:not([data-drag-handle]), a, input")) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      drag.current = { startX: e.clientX, startY: e.clientY, origin: offset };
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      const d = drag.current;
      if (!d) return;
      setOffset(clamp({ x: d.origin.x + e.clientX - d.startX, y: d.origin.y + e.clientY - d.startY }, sizeOf(e.currentTarget)));
    },
    onPointerUp: (e: PointerEvent<HTMLElement>) => {
      if (!drag.current) return;
      drag.current = null;
      lastDragEnd.current = Date.now();
      e.currentTarget.releasePointerCapture(e.pointerId);
      persist(offset);
    },
    onDoubleClick: () => {
      setOffset({ x: 0, y: 0 });
      persist({ x: 0, y: 0 });
    },
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      const delta: Record<string, Offset> = {
        ArrowLeft: { x: -KEY_STEP, y: 0 },
        ArrowRight: { x: KEY_STEP, y: 0 },
        ArrowUp: { x: 0, y: -KEY_STEP },
        ArrowDown: { x: 0, y: KEY_STEP },
      };
      if (e.key === "Home") {
        e.preventDefault();
        setOffset({ x: 0, y: 0 });
        persist({ x: 0, y: 0 });
      } else if (delta[e.key]) {
        e.preventDefault();
        const next = clamp({ x: offset.x + delta[e.key].x, y: offset.y + delta[e.key].y }, sizeOf(e.currentTarget));
        setOffset(next);
        persist(next);
      }
    },
  };

  /**
   * True while dragging and for a moment after: releasing the mouse outside the panel (or the
   * window) would otherwise be read by a modal as an outside click and close it mid-move.
   */
  const recentlyDragged = useCallback(() => drag.current !== null || Date.now() - lastDragEnd.current < 300, []);

  return { offset, handleProps, recentlyDragged };
}
