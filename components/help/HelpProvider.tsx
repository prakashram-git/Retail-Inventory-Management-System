"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { getHelpPayload, getHelpProgress, saveHelpProgress } from "@/lib/actions/help";
import { bundledHelp, cacheHelpPayload, readCachedHelp } from "@/lib/help/cache";
import type { HelpPayload, HelpProgress, HelpWorkflow } from "@/lib/help/types";
import { HelpCenterContext, type HelpCenterContextValue } from "./HelpCenterContext";
import type { UserRole } from "@/lib/types/domain";
import { HelpCenterSheet } from "./HelpCenterSheet";
import { SpotlightTour } from "./SpotlightTour";

export function HelpProvider({ role, children }: { role: UserRole; children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [payload, setPayload] = useState<HelpPayload>(() => bundledHelp(role));
  const [progress, setProgress] = useState<Record<string, HelpProgress>>({});
  const [isOpen, setIsOpen] = useState(false);
  const [activeWorkflowId, setActiveWorkflowId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeWorkflow, setActiveWorkflow] = useState<HelpWorkflow | null>(null);
  const [trainingMode, setTrainingMode] = useState(false);

  // Launch pre-cache: show IndexedDB content immediately, then refresh from
  // the server (RLS-filtered for this role) and re-cache incl. illustrations.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cached = await readCachedHelp(role).catch(() => null);
      if (cached && !cancelled) setPayload(cached);
      if (!navigator.onLine) return;
      try {
        const [fresh, prog] = await Promise.all([getHelpPayload(), getHelpProgress()]);
        if (cancelled) return;
        if (fresh.workflows.length > 0) {
          setPayload(fresh);
          await cacheHelpPayload(fresh, role);
        }
        setProgress(Object.fromEntries(prog.map((p) => [p.workflow_id, p])));
      } catch {
        // Offline or transient failure: cached / bundled content stays.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [role]);

  const openHelp = useCallback((workflowId?: string) => {
    setActiveWorkflowId(workflowId ?? null);
    setIsOpen(true);
  }, []);
  const closeHelp = useCallback(() => {
    setIsOpen(false);
    setActiveWorkflowId(null);
  }, []);
  const toggleHelp = useCallback(() => {
    setIsOpen((open) => !open);
    setActiveWorkflowId(null);
  }, []);

  // F1 toggles the drawer from anywhere; "?" does too, unless the user is typing.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "F1") {
        event.preventDefault();
        toggleHelp();
        return;
      }
      if (event.key === "?" && !event.ctrlKey && !event.metaKey && !event.altKey) {
        const el = event.target as HTMLElement | null;
        const typing =
          !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
        if (!typing) {
          event.preventDefault();
          toggleHelp();
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleHelp]);

  const startTour = useCallback(
    (workflowId: string) => {
      const wf = payload.workflows.find((w) => w.id === workflowId);
      if (!wf) return;
      closeHelp();
      if (wf.target_route && wf.target_route !== pathname) router.push(wf.target_route);
      setActiveWorkflow(wf);
    },
    [payload, pathname, router, closeHelp]
  );

  const finishTour = useCallback(
    (completed: boolean, lastStepIndex: number) => {
      const wf = activeWorkflow;
      setActiveWorkflow(null);
      if (!wf) return;
      setProgress((prev) => ({
        ...prev,
        [wf.id]: {
          workflow_id: wf.id,
          completed: completed || prev[wf.id]?.completed || false,
          last_step_index: lastStepIndex,
          feedback_rating: prev[wf.id]?.feedback_rating ?? null,
        },
      }));
      if (navigator.onLine) {
        void saveHelpProgress({
          workflowId: wf.id,
          lastStepIndex,
          completed: completed || undefined,
        }).catch(() => {});
      }
    },
    [activeWorkflow]
  );

  const value = useMemo<HelpCenterContextValue>(
    () => ({
      isOpen,
      openHelp,
      closeHelp,
      toggleHelp,
      activeWorkflowId,
      searchQuery,
      setSearchQuery,
      payload,
      progress,
      role,
      startTour,
      activeWorkflow,
      trainingMode,
      setTrainingMode,
    }),
    [isOpen, openHelp, closeHelp, toggleHelp, activeWorkflowId, searchQuery, payload, progress, role, startTour, activeWorkflow, trainingMode]
  );

  return (
    <HelpCenterContext.Provider value={value}>
      {children}
      <HelpCenterSheet />
      {activeWorkflow && (
        <SpotlightTour
          key={activeWorkflow.id}
          workflow={activeWorkflow}
          trainingMode={trainingMode}
          onTrainingModeChange={setTrainingMode}
          onExit={finishTour}
        />
      )}
    </HelpCenterContext.Provider>
  );
}
