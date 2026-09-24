"use client";

import { HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useHelpCenter } from "./HelpCenterContext";

/** `workflowId` deep-links the drawer to one workflow (e.g. the POS uses wf_barcode_checkout). */
export function HelpButton({ workflowId }: { workflowId?: string }) {
  const { openHelp, trainingMode } = useHelpCenter();
  return (
    <Button
      variant="ghost"
      size="icon"
      className="touch-target relative"
      aria-label="Open Help Center"
      title="Help Center (F1 or ?)"
      data-tour="pos-help-btn"
      onClick={() => openHelp(workflowId)}
    >
      <HelpCircle className="h-5 w-5" />
      {trainingMode && (
        <span className="absolute right-1 top-1 size-2 rounded-full bg-amber-500" aria-hidden />
      )}
    </Button>
  );
}
