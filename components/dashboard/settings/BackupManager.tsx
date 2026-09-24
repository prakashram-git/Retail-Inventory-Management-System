"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { DatabaseBackup, Download, RotateCcw, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { triggerSnapshot, getArchiveList, restoreFromArchive } from "@/lib/actions/backup";

interface ArchiveRow {
  name: string;
  sizeBytes: number;
  createdAt: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

export function BackupManager({ initialArchives }: { initialArchives: ArchiveRow[] }) {
  const [archives, setArchives] = useState<ArchiveRow[]>(initialArchives);
  const [isPending, startTransition] = useTransition();
  const [restoreTarget, setRestoreTarget] = useState<ArchiveRow | null>(null);
  const [confirmPhrase, setConfirmPhrase] = useState("");
  const [dryRunResult, setDryRunResult] = useState<string | null>(null);

  async function refresh() {
    try {
      setArchives(await getArchiveList());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load archives");
    }
  }

  function handleSnapshot(archive: boolean) {
    startTransition(async () => {
      try {
        const result = await triggerSnapshot(archive);
        toast.success(archive ? "Encrypted archive created" : "Snapshot written to disk");
        if (result.archivePath) await refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Snapshot failed");
      }
    });
  }

  function openRestoreDialog(archive: ArchiveRow) {
    setRestoreTarget(archive);
    setConfirmPhrase("");
    setDryRunResult(null);
  }

  function handleDryRun() {
    if (!restoreTarget) return;
    startTransition(async () => {
      try {
        const { reports } = await restoreFromArchive(restoreTarget.name, "", true);
        setDryRunResult(
          reports.map((r) => `${r.table}: ${r.rows} row(s) would be restored`).join("\n")
        );
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Dry run failed");
      }
    });
  }

  function handleRestore() {
    if (!restoreTarget) return;
    startTransition(async () => {
      try {
        const { reports } = await restoreFromArchive(restoreTarget.name, confirmPhrase, false);
        const errorCount = reports.reduce((sum, r) => sum + r.errors.length, 0);
        if (errorCount > 0) {
          toast.error(`Restore finished with ${errorCount} error(s) — check server logs`);
        } else {
          toast.success("Restore complete");
        }
        setRestoreTarget(null);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Restore failed");
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Card size="sm">
        <CardHeader>
          <CardTitle>Backup & disaster recovery</CardTitle>
          <CardDescription>
            On-demand encrypted snapshots of every table. Archives are stored on this server&apos;s
            local disk — they will not survive a redeploy unless BACKUP_STORAGE_DIR points at a
            persistent volume or an S3-compatible bucket is configured.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button onClick={() => handleSnapshot(false)} disabled={isPending} variant="outline">
            <DatabaseBackup /> Write snapshot (no archive)
          </Button>
          <Button onClick={() => handleSnapshot(true)} disabled={isPending}>
            <DatabaseBackup /> Create encrypted archive now
          </Button>
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Archives</CardTitle>
          <CardDescription>Encrypted, retained for 14 days by default.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>File</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {archives.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    No archives yet.
                  </TableCell>
                </TableRow>
              )}
              {archives.map((archive) => (
                <TableRow key={archive.name}>
                  <TableCell className="font-mono text-xs">{archive.name}</TableCell>
                  <TableCell>{formatBytes(archive.sizeBytes)}</TableCell>
                  <TableCell>{new Date(archive.createdAt).toLocaleString()}</TableCell>
                  <TableCell className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      render={
                        <a href={`/api/backup/download?file=${encodeURIComponent(archive.name)}`} download />
                      }
                    >
                      <Download />
                      <span className="sr-only">Download</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-destructive"
                      onClick={() => openRestoreDialog(archive)}
                    >
                      <RotateCcw />
                      <span className="sr-only">Restore</span>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!restoreTarget} onOpenChange={(next) => !isPending && !next && setRestoreTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="text-destructive" /> Restore {restoreTarget?.name}
            </DialogTitle>
            <DialogDescription>
              This can overwrite live data. Run a dry run first to see what would change, then type{" "}
              <span className="font-mono font-semibold">CONFIRM-RESTORE</span> to actually apply it.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <Button variant="outline" onClick={handleDryRun} disabled={isPending}>
              Run dry run
            </Button>
            {dryRunResult && (
              <pre className="max-h-40 overflow-auto rounded-md bg-muted p-2 text-xs whitespace-pre-wrap">
                {dryRunResult}
              </pre>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="confirm-restore">Confirmation phrase</Label>
              <Input
                id="confirm-restore"
                value={confirmPhrase}
                onChange={(e) => setConfirmPhrase(e.target.value)}
                placeholder="CONFIRM-RESTORE"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRestoreTarget(null)} disabled={isPending}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRestore}
              disabled={isPending || confirmPhrase !== "CONFIRM-RESTORE"}
            >
              {isPending ? "Restoring..." : "Restore"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
