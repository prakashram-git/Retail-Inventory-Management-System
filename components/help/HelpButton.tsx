"use client";

import { HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useHelp } from "./HelpProvider";

export function HelpButton() {
  const { setHelpOpen, trainingMode } = useHelp();
  return (
    <Button
      variant="ghost"
      size="icon"
      className="touch-target relative"
      aria-label="Help Center (F1)"
      title="Help Center (F1)"
      data-tour="pos-help-btn"
      onClick={() => setHelpOpen(true)}
    >
      <HelpCircle className="h-5 w-5" />
      {trainingMode && (
        <span className="absolute right-1 top-1 size-2 rounded-full bg-amber-500" aria-hidden />
      )}
    </Button>
  );
}
