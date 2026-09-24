"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, CameraOff, ScanLine } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

// The Barcode Detection API isn't yet in TypeScript's lib.dom.d.ts. It ships
// in Chrome/Edge (desktop and Android) but not Safari or Firefox, so this
// feature degrades to "unsupported" there rather than crashing — there is no
// polyfill dependency here on purpose, to keep the app's dependency surface
// small for what the request called a stretch goal.
declare global {
  interface Window {
    BarcodeDetector?: new (options?: { formats?: string[] }) => {
      detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
    };
  }
}

const SCAN_FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39"];

interface CameraBarcodeScannerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDetect: (code: string) => void;
}

export function CameraBarcodeScanner({ open, onOpenChange, onDetect }: CameraBarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<"starting" | "scanning" | "unsupported" | "error">("starting");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    if (typeof window === "undefined" || !window.BarcodeDetector) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStatus("unsupported");
      return;
    }

    let stream: MediaStream | null = null;
    let rafId = 0;
    let cancelled = false;
    const detector = new window.BarcodeDetector({ formats: SCAN_FORMATS });

    async function tick() {
      if (cancelled || !videoRef.current || videoRef.current.readyState < 2) {
        rafId = requestAnimationFrame(tick);
        return;
      }
      try {
        const results = await detector.detect(videoRef.current);
        if (results.length > 0) {
          onDetect(results[0].rawValue);
          return;
        }
      } catch {
        // Transient decode errors are expected between frames — keep scanning.
      }
      rafId = requestAnimationFrame(tick);
    }

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setStatus("scanning");
        rafId = requestAnimationFrame(tick);
      } catch (err) {
        setStatus("error");
        setErrorMessage(
          err instanceof Error ? err.message : "Couldn't access the camera."
        );
      }
    }

    start();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      stream?.getTracks().forEach((track) => track.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanLine className="size-4" /> Scan a barcode
          </DialogTitle>
          <DialogDescription>Point the camera at a product barcode.</DialogDescription>
        </DialogHeader>

        {status === "unsupported" ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
            <CameraOff className="size-6" />
            <p>Camera scanning isn&apos;t supported in this browser.</p>
            <p className="text-xs">Try Chrome or Edge, or search by SKU/barcode instead.</p>
          </div>
        ) : status === "error" ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
            <CameraOff className="size-6" />
            <p>{errorMessage ?? "Couldn't access the camera."}</p>
          </div>
        ) : (
          <div className="relative aspect-video overflow-hidden rounded-lg bg-black">
            <video ref={videoRef} muted playsInline className="h-full w-full object-cover" />
            <div className="pointer-events-none absolute inset-8 rounded-lg border-2 border-primary/70" />
            {status === "starting" && (
              <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/50 text-sm text-white">
                <Camera className="size-4 animate-pulse" /> Starting camera…
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
