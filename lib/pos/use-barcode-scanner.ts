"use client";

import { useEffect, useRef } from "react";

/** Keeps a ref pointed at the latest value without touching it during render. */
function useLatestRef<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
}

/** UPC-A/EAN-13/most SKUs are at least this long; shorter runs are almost always stray keystrokes. */
const MIN_BARCODE_LENGTH = 8;

/** Hardware scanners fire keystrokes only a few ms apart; this is generous enough for slow scanners too. */
const BUFFER_RESET_MS = 300;

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.isContentEditable
  );
}

/**
 * Listens for the rapid-fire keystroke-then-Enter pattern a hardware
 * barcode scanner emits and calls `onScan` with the full code — never on
 * individual keystrokes, which would otherwise split a single scan into
 * several partial "additions" if the scanner types slowly.
 *
 * Skips buffering while an input/textarea/contenteditable has focus, so
 * manual typing (e.g. the catalog search box) isn't hijacked.
 */
export function useBarcodeScanner(onScan: (code: string) => void) {
  const onScanRef = useLatestRef(onScan);

  useEffect(() => {
    let buffer = "";
    let lastKeyAt = 0;

    function handleKeyDown(e: KeyboardEvent) {
      if (isEditableTarget(e.target)) return;

      const now = Date.now();
      if (now - lastKeyAt > BUFFER_RESET_MS) {
        buffer = "";
      }
      lastKeyAt = now;

      if (e.key === "Enter") {
        const code = buffer;
        buffer = "";
        if (code.length >= MIN_BARCODE_LENGTH) {
          onScanRef.current(code);
        }
        return;
      }

      if (e.key.length === 1) {
        buffer += e.key;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onScanRef]);
}
