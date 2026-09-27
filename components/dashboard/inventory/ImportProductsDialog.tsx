"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Upload, Download } from "lucide-react";
import { parseCsvText } from "@/lib/csv/parseCsv";
import {
  validateProductsCsvAction,
  commitProductsImportAction,
  type ProductImportResolved,
} from "@/lib/actions/bulkImport";
import type { RowValidationResult, CommitRowResult } from "@/lib/csv/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";

type Stage = "select" | "preview" | "committing" | "done";

interface ImportProductsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ImportProductsDialog({ open, onOpenChange }: ImportProductsDialogProps) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("select");
  const [rows, setRows] = useState<RowValidationResult<ProductImportResolved>[]>([]);
  const [featureBlocked, setFeatureBlocked] = useState<string | null>(null);
  const [commitResults, setCommitResults] = useState<CommitRowResult[]>([]);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setStage("select");
    setRows([]);
    setFeatureBlocked(null);
    setCommitResults([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  async function handleFile(file: File) {
    setBusy(true);
    try {
      const text = await file.text();
      const parsed = parseCsvText(text);
      if (parsed.rows.length === 0) {
        toast.error("That file has no data rows.");
        return;
      }
      const summary = await validateProductsCsvAction(parsed.rows);
      if (summary.featureBlocked) {
        setFeatureBlocked(summary.featureBlockedMessage ?? "Product creation is disabled on this store's profile.");
        setStage("preview");
        return;
      }
      setRows(summary.rows);
      setStage("preview");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not read that file.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCommit() {
    const validRows = rows
      .filter((r) => r.status === "valid" && r.resolved)
      .map((r) => ({ rowNumber: r.rowNumber, input: r.resolved! }));
    if (validRows.length === 0) return;

    setStage("committing");
    try {
      const { results } = await commitProductsImportAction(validRows);
      setCommitResults(results);
      setStage("done");
      if (results.some((r) => r.success)) router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Import failed.");
      setStage("preview");
    }
  }

  const validCount = rows.filter((r) => r.status === "valid").length;
  const invalidCount = rows.length - validCount;
  const successCount = commitResults.filter((r) => r.success).length;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import products from CSV</DialogTitle>
          <DialogDescription>
            Import categories first if any rows reference a category by name.
          </DialogDescription>
        </DialogHeader>

        {stage === "select" && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              Don&apos;t have SKUs yet? Leave that column out entirely — we&apos;ll generate one for
              each product automatically. Barcode is optional too.
            </p>
            <a
              href="/templates/products-import-template.csv"
              download
              className="inline-flex w-fit items-center gap-1.5 text-sm text-primary underline underline-offset-4"
            >
              <Download className="size-3.5" />
              Download template
            </a>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              disabled={busy}
              data-testid="import-products-file-input"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
              }}
              className="text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium"
            />
          </div>
        )}

        {stage === "preview" && featureBlocked && (
          <Alert variant="destructive">
            <AlertTitle>Import disabled</AlertTitle>
            <AlertDescription>{featureBlocked}</AlertDescription>
          </Alert>
        )}

        {stage === "preview" && !featureBlocked && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              {validCount} row{validCount === 1 ? "" : "s"} will be imported
              {invalidCount > 0 ? `, ${invalidCount} skipped due to errors` : ""}.
            </p>
            <div className="max-h-96 overflow-y-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">Row</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead className="w-24">Status</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.rowNumber}>
                      <TableCell className="text-muted-foreground">{row.rowNumber}</TableCell>
                      <TableCell>{row.raw.name || <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell>
                        {row.resolved?.sku || row.raw.sku || (
                          <span className="text-muted-foreground italic">Auto-generated</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={row.status === "valid" ? "secondary" : "destructive"}>
                          {row.status === "valid" ? "Valid" : "Invalid"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {row.reasons.join("; ")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {stage === "committing" && (
          <p className="py-6 text-center text-sm text-muted-foreground">Importing…</p>
        )}

        {stage === "done" && (
          <div className="flex flex-col gap-3">
            <p className="text-sm">
              {successCount} of {commitResults.length} row{commitResults.length === 1 ? "" : "s"} imported successfully.
            </p>
            <div className="max-h-96 overflow-y-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">Row</TableHead>
                    <TableHead className="w-24">Status</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {commitResults.map((r) => (
                    <TableRow key={r.rowNumber}>
                      <TableCell className="text-muted-foreground">{r.rowNumber}</TableCell>
                      <TableCell>
                        <Badge variant={r.success ? "secondary" : "destructive"}>
                          {r.success ? "Imported" : "Failed"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.error}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        <DialogFooter>
          {stage === "preview" && !featureBlocked && (
            <>
              <Button variant="outline" onClick={reset}>
                Start over
              </Button>
              <Button onClick={handleCommit} disabled={validCount === 0}>
                <Upload />
                Import {validCount} row{validCount === 1 ? "" : "s"}
              </Button>
            </>
          )}
          {stage === "done" && <Button onClick={() => handleOpenChange(false)}>Close</Button>}
          {(stage === "select" || (stage === "preview" && featureBlocked)) && (
            <Button variant="outline" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
