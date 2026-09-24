"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Check, Copy, Loader2, RefreshCw, ScanSearch, TriangleAlert, CheckCircle2, BookOpen } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  checkDocumentationDriftAction,
  getHelpMaintenanceStatusAction,
  triggerScreenshotRegenerationAction,
  type MaintenanceStatus,
} from "@/lib/actions/helpAdmin";
import type { DriftCheckResult } from "@/lib/help/driftService";
import { useHelpCenter } from "./HelpCenterContext";

const COMMANDS = ["npm run help:check-drift", "npm run help:refresh-assets"] as const;

function CodeBlock({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);
  const [prefix, ...rest] = command.split(" ");
  const [, script] = [prefix, rest.join(" ")];
  const [run, name] = script.split(" ");

  async function copy() {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      toast.success("Command copied");
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Could not access the clipboard — select and copy manually.");
    }
  }

  return (
    <div className="flex items-center justify-between gap-2 rounded-lg bg-slate-950 px-3 py-2 font-mono text-xs text-slate-100">
      <code data-testid="cli-command">
        <span className="text-emerald-400">{prefix}</span> <span className="text-sky-300">{run}</span>{" "}
        <span className="text-amber-300">{name}</span>
      </code>
      <Button type="button" size="xs" variant="secondary" onClick={copy} aria-label={`Copy command ${command}`}>
        {copied ? <Check /> : <Copy />}
        {copied ? "Copied" : "Copy Command"}
      </Button>
    </div>
  );
}

export function AdminMaintenanceCard({
  expectedWorkflows,
  initialStatus,
}: {
  expectedWorkflows: number;
  initialStatus: MaintenanceStatus;
}) {
  const { role, payload } = useHelpCenter();
  const [status, setStatus] = useState(initialStatus);
  const [drift, setDrift] = useState<DriftCheckResult | null>(null);
  const [checking, startCheck] = useTransition();
  const [starting, startRegen] = useTransition();
  const lastJobStatus = useRef(initialStatus.job?.status);

  const refreshStatus = useCallback(async () => {
    try {
      setStatus(await getHelpMaintenanceStatusAction());
    } catch {
      /* transient; next poll retries */
    }
  }, []);

  const running = status.job?.status === "running";
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(refreshStatus, 3000);
    return () => window.clearInterval(id);
  }, [running, refreshStatus]);

  // Announce a job finishing while this card is open.
  useEffect(() => {
    const now = status.job?.status;
    if (lastJobStatus.current === "running" && now && now !== "running") {
      if (now === "succeeded") toast.success("Screenshots regenerated");
      else toast.error("Screenshot regeneration failed — see the log below");
    }
    lastJobStatus.current = now;
  }, [status.job?.status]);

  // Defence in depth: the page is already super_admin-only server-side.
  if (role !== "super_admin") return null;

  function runDriftCheck() {
    startCheck(async () => {
      try {
        setDrift(await checkDocumentationDriftAction());
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Drift check failed");
      }
    });
  }

  function regenerate() {
    startRegen(async () => {
      try {
        const result = await triggerScreenshotRegenerationAction();
        if (!result.started) {
          toast.error(result.reason);
          return;
        }
        toast.info("Capturing viewports: Desktop 1280x800 & Mobile 390x844...");
        await refreshStatus();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not start regeneration");
      }
    });
  }

  const loaded = payload.workflows.length;

  return (
    <Card data-testid="help-maintenance-console">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Documentation Maintenance Console</CardTitle>
          <Badge variant="secondary" data-testid="workflow-counter">
            {status.totalWorkflows} / {expectedWorkflows} Active Workflows
          </Badge>
        </div>
        <CardDescription>
          Check whether the UI has changed since the Help screenshots were taken, and regenerate them.
          {loaded !== status.totalWorkflows && ` (${loaded} loaded in this session.)`}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          <Button onClick={runDriftCheck} disabled={checking} data-testid="check-drift-btn">
            {checking ? <Loader2 className="animate-spin" /> : <ScanSearch />}
            Check UI Drift Now
          </Button>
          <Button
            variant="outline"
            onClick={regenerate}
            disabled={starting || running}
            data-testid="regenerate-btn"
          >
            {starting || running ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            {running ? "Capturing..." : "Regenerate Screenshots"}
          </Button>
        </div>

        {drift && (
          <div
            role="status"
            data-testid="drift-result"
            className={
              drift.driftDetected
                ? "flex gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300"
                : "flex gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-800 dark:text-emerald-300"
            }
          >
            {drift.driftDetected ? (
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            ) : (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
            )}
            <span>
              {drift.driftDetected
                ? `Drift detected in ${drift.components.join(", ")}`
                : "All UI hashes valid"}
              <span className="ml-1 text-xs opacity-70">
                (checked {new Date(drift.checkedAt).toLocaleTimeString()})
              </span>
            </span>
          </div>
        )}

        {running && (
          <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Capturing viewports: Desktop 1280x800 &amp; Mobile 390x844...
          </p>
        )}
        {status.job && !running && (
          <div className="rounded-lg border p-3 text-xs" data-testid="job-log">
            <p className="font-medium">
              Last run {status.job.status}
              {status.job.finishedAt ? ` at ${new Date(status.job.finishedAt).toLocaleTimeString()}` : ""}
            </p>
            {status.job.status === "failed" && (
              <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap text-muted-foreground">
                {status.job.logTail.join("\n")}
              </pre>
            )}
          </div>
        )}

        <p className="text-sm text-muted-foreground" data-testid="last-generated">
          Last generated:{" "}
          {status.lastGeneratedAt ? new Date(status.lastGeneratedAt).toLocaleString() : "never"}
        </p>
        {status.runner === "unavailable" && (
          <p className="text-xs text-muted-foreground">
            This deployment can&apos;t run headless Chromium, so Regenerate needs a
            HELP_REFRESH_WEBHOOK_URL — or use the commands below on a machine that can.
          </p>
        )}

        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Terminal</p>
          {COMMANDS.map((c) => (
            <CodeBlock key={c} command={c} />
          ))}
        </div>

        <Link
          href="/dashboard/settings/docs"
          data-testid="technical-docs-link"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          <BookOpen className="size-4" />
          Open Super Admin Technical Runbooks &amp; Architecture Specs ➔
        </Link>
      </CardContent>
    </Card>
  );
}
