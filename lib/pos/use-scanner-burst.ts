"use client";

import { useEffect, useRef } from "react";

/** Scanners emit keys a few ms apart; people never sustain this. */
const MAX_BURST_GAP_MS = 60;
/** Keystrokes in a burst before we are sure it is a scanner (the earlier ones already leaked). */
const CONFIRM_AFTER = 3;
const MIN_CODE_LENGTH = 6;
/** Scanners configured without an Enter suffix: treat silence after a burst as end-of-scan. */
const IDLE_FLUSH_MS = 120;

function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = el instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, value);
  // React listens to the native input event; without it a controlled input keeps its old state.
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

/**
 * Detects a hardware barcode-scanner burst even while a form field has focus, WITHOUT
 * leaving the scanned digits in that field.
 *
 * A keyboard-wedge scanner types into whatever is focused. The first one or two keys of a
 * burst are indistinguishable from typing, so they do land in the field; once the burst is
 * recognised we (1) stop all later keys from reaching it, (2) put the field back to what it
 * held before the first key, and (3) swallow the trailing Enter so the surrounding form
 * doesn't submit. Human typing (>60ms between keys) never qualifies.
 */
export function useScannerBurst(onScan: (code: string) => void, enabled = true) {
  const onScanRef = useRef(onScan);
  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    if (!enabled) return;
    let buffer = "";
    let lastAt = 0;
    let burst = false;
    let field: HTMLInputElement | HTMLTextAreaElement | null = null;
    let before = "";
    let idleTimer: ReturnType<typeof setTimeout> | null = null;

    const reset = () => {
      buffer = "";
      burst = false;
      field = null;
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = null;
    };
    const restoreField = () => {
      if (field && field.value !== before) setNativeValue(field, before);
    };
    const finish = () => {
      const code = buffer;
      reset();
      if (code.length >= MIN_CODE_LENGTH) onScanRef.current(code);
    };

    function onKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const now = performance.now();

      if (e.key === "Enter") {
        if (burst && buffer.length >= MIN_CODE_LENGTH) {
          e.preventDefault();
          e.stopPropagation();
          restoreField();
          finish();
        } else {
          reset();
        }
        return;
      }
      if (e.key.length !== 1) return;

      const target = e.target;
      const isField = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;

      if (now - lastAt > MAX_BURST_GAP_MS) {
        reset();
        if (isField) {
          field = target;
          before = target.value; // keydown fires before the character is inserted
        }
      }
      lastAt = now;
      buffer += e.key;

      if (!burst && buffer.length >= CONFIRM_AFTER) {
        burst = true;
        restoreField(); // remove the 1–2 characters that already leaked in
      }
      if (burst) {
        e.preventDefault();
        e.stopPropagation();
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
          if (buffer.length >= MIN_CODE_LENGTH + 2) finish();
          else reset();
        }, IDLE_FLUSH_MS);
      }
    }

    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      reset();
    };
  }, [enabled]);
}
