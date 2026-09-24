"use client";

import { createContext, useContext } from "react";
import type { HelpPayload, HelpProgress, HelpWorkflow } from "@/lib/help/types";
import type { UserRole } from "@/lib/types/domain";

export interface HelpCenterContextValue {
  isOpen: boolean;
  /** Opens the drawer; with a workflow id it also expands and scrolls to that workflow. */
  openHelp: (workflowId?: string) => void;
  closeHelp: () => void;
  toggleHelp: () => void;
  activeWorkflowId: string | null;
  searchQuery: string;
  setSearchQuery: (query: string) => void;

  payload: HelpPayload;
  progress: Record<string, HelpProgress>;
  role: UserRole;
  startTour: (workflowId: string) => void;
  activeWorkflow: HelpWorkflow | null;
  /** Training Sandbox: transaction actions must not persist anything. */
  trainingMode: boolean;
  setTrainingMode: (on: boolean) => void;
}

export const HelpCenterContext = createContext<HelpCenterContextValue | null>(null);

export function useHelpCenter() {
  const ctx = useContext(HelpCenterContext);
  if (!ctx) throw new Error("useHelpCenter must be used within a HelpProvider");
  return ctx;
}
