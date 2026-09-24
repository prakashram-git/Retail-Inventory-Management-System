"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { getHelpPayload, getHelpProgress, saveHelpProgress } from "@/lib/actions/help";
import { bundledHelp, cacheHelpPayload, readCachedHelp } from "@/lib/help/cache";
import type { HelpPayload, HelpProgress, HelpWorkflow } from "@/lib/help/types";
import type { UserRole } from "@/lib/types/domain";
import { HelpCenterSheet } from "./HelpCenterSheet";
import { SpotlightTour } from "./SpotlightTour";

interface HelpContextValue {
  payload: HelpPayload;
  progress: Record<string, HelpProgress>;
  role: UserRole;
  helpOpen: boolean;
  setHelpOpen: (open: boolean) => void;
  startTour: (workflowId: string) => void;
  activeWorkflow: HelpWorkflow | null;
  /** Training Sandbox: transaction actions must not persist anything. */
  trainingMode: boolean;
  setTrainingMode: (on: boolean) => void;
}

const HelpContext = createContext<HelpContextValue | null>(null);

export function useHelp() {
  const ctx = useContext(HelpContext);
  if (!ctx) throw new Error("useHelp must be used within a HelpProvider");
  return ctx;
}

export function HelpProvider({ role, children }: { role: UserRole; children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [payload, setPayload] = useState<HelpPayload>(() => bundledHelp(role));
  const [progress, setProgress] = useState<Record<string, HelpProgress>>({});
  const [helpOpen, setHelpOpen] = useState(false);
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

  // F1 toggles the drawer from anywhere.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "F1") {
        event.preventDefault();
        setHelpOpen((open) => !open);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const startTour = useCallback(
    (workflowId: string) => {
      const wf = payload.workflows.find((w) => w.id === workflowId);
      if (!wf) return;
      setHelpOpen(false);
      if (wf.target_route && wf.target_route !== pathname) router.push(wf.target_route);
      setActiveWorkflow(wf);
    },
    [payload, pathname, router]
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

  const value = useMemo<HelpContextValue>(
    () => ({
      payload,
      progress,
      role,
      helpOpen,
      setHelpOpen,
      startTour,
      activeWorkflow,
      trainingMode,
      setTrainingMode,
    }),
    [payload, progress, role, helpOpen, startTour, activeWorkflow, trainingMode]
  );

  return (
    <HelpContext.Provider value={value}>
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
    </HelpContext.Provider>
  );
}
