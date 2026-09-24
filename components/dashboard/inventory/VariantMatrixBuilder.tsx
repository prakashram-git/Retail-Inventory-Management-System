"use client";

import { useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  MAX_VARIANTS,
  buildVariantRows,
  countCombinations,
  variantSku,
  type VariantOption,
  type VariantRow,
} from "@/lib/products/variants";
import { validateGs1Barcode } from "@/lib/utils/gs1Validator";

interface VariantMatrixBuilderProps {
  baseSku: string;
  defaults: { retail_price: string; cost_price: string };
  rows: VariantRow[];
  onRowsChange: (rows: VariantRow[]) => void;
  disabled?: boolean;
}

const START_OPTIONS: VariantOption[] = [
  { name: "Color", values: [] },
  { name: "Size", values: [] },
];

/**
 * Options in, permutation rows out. Rows are owned by the parent (controlled) so the
 * product form can submit them; option chips are local. Editing options regenerates the
 * matrix but keeps edits on combinations that still exist.
 */
export function VariantMatrixBuilder({ baseSku, defaults, rows, onRowsChange, disabled }: VariantMatrixBuilderProps) {
  const [options, setOptions] = useState<VariantOption[]>(START_OPTIONS);
  const [draft, setDraft] = useState<string[]>(["", ""]);
  const combos = countCombinations(options);
  const tooMany = combos > MAX_VARIANTS;

  function apply(next: VariantOption[]) {
    setOptions(next);
    if (countCombinations(next) <= MAX_VARIANTS) onRowsChange(buildVariantRows(next, rows, defaults));
  }

  function addValues(index: number, raw: string) {
    const incoming = raw.split(",").map((v) => v.trim()).filter(Boolean);
    if (incoming.length === 0) return;
    apply(options.map((o, i) => (i === index ? { ...o, values: [...new Set([...o.values, ...incoming])] } : o)));
    setDraft((d) => d.map((v, i) => (i === index ? "" : v)));
  }

  function removeValue(index: number, value: string) {
    apply(options.map((o, i) => (i === index ? { ...o, values: o.values.filter((v) => v !== value) } : o)));
  }

  function patch(key: string, change: Partial<VariantRow>) {
    onRowsChange(rows.map((r) => (r.key === key ? { ...r, ...change } : r)));
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-3" data-testid="variant-builder">
      <div className="flex flex-col gap-2">
        {options.map((option, i) => (
          <div key={i} className="grid grid-cols-[6rem_1fr_auto] items-start gap-2">
            <Input
              aria-label={`Option ${i + 1} name`}
              value={option.name}
              onChange={(e) => apply(options.map((o, j) => (j === i ? { ...o, name: e.target.value } : o)))}
              disabled={disabled}
              className="h-8 text-xs"
            />
            <div className="flex min-h-8 flex-wrap items-center gap-1 rounded-lg border border-input px-2 py-1">
              {option.values.map((v) => (
                <Badge key={v} variant="secondary" className="gap-1">
                  {v}
                  <button type="button" onClick={() => removeValue(i, v)} disabled={disabled} aria-label={`Remove ${v}`}>
                    <X className="size-3" />
                  </button>
                </Badge>
              ))}
              <input
                aria-label={`${option.name || `Option ${i + 1}`} values`}
                value={draft[i] ?? ""}
                onChange={(e) => setDraft((d) => d.map((v, j) => (j === i ? e.target.value : v)))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    addValues(i, draft[i] ?? "");
                  }
                }}
                onBlur={() => addValues(i, draft[i] ?? "")}
                disabled={disabled}
                placeholder={option.values.length === 0 ? (i === 0 ? "Black, Silver" : "S, M, L") : ""}
                className="min-w-16 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
              />
            </div>
            {options.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={() => {
                  setDraft((d) => d.filter((_, j) => j !== i));
                  apply(options.filter((_, j) => j !== i));
                }}
                disabled={disabled}
                aria-label={`Remove option ${option.name}`}
              >
                <Trash2 />
              </Button>
            )}
          </div>
        ))}
        {options.length < 3 && (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="self-start"
            onClick={() => {
              setOptions([...options, { name: "", values: [] }]);
              setDraft([...draft, ""]);
            }}
            disabled={disabled}
          >
            <Plus /> Add option
          </Button>
        )}
      </div>

      {tooMany && (
        <p className="text-xs text-destructive" role="alert">
          {combos} combinations exceeds the limit of {MAX_VARIANTS}. Remove some values.
        </p>
      )}

      {rows.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs text-muted-foreground">
            {rows.length} variant{rows.length === 1 ? "" : "s"} · SKUs are <span className="font-mono">{baseSku.trim().toUpperCase() || "BASE"}-…</span>
          </p>
          <div className="max-h-64 overflow-auto rounded-md border">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted text-left">
                <tr>
                  <th className="px-2 py-1 font-medium">Variant</th>
                  <th className="px-2 py-1 font-medium">SKU</th>
                  <th className="px-2 py-1 font-medium">Barcode</th>
                  <th className="px-2 py-1 font-medium">Retail</th>
                  <th className="px-2 py-1 font-medium">Cost</th>
                  <th className="px-2 py-1 font-medium">Stock</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const gs1 = row.barcode ? validateGs1Barcode(row.barcode) : null;
                  return (
                    <tr key={row.key} className="border-t" data-testid="variant-row">
                      <td className="whitespace-nowrap px-2 py-1">{Object.values(row.attributes).join(" / ")}</td>
                      <td className="px-1 py-1">
                        <Input
                          aria-label={`SKU for ${Object.values(row.attributes).join(" ")}`}
                          value={variantSku(baseSku, row)}
                          onChange={(e) => patch(row.key, { skuOverride: e.target.value.toUpperCase() })}
                          disabled={disabled}
                          className="h-7 w-36 font-mono text-xs"
                        />
                      </td>
                      <td className="px-1 py-1">
                        <Input
                          aria-label={`Barcode for ${Object.values(row.attributes).join(" ")}`}
                          value={row.barcode}
                          onChange={(e) => patch(row.key, { barcode: e.target.value.trim() })}
                          disabled={disabled}
                          aria-invalid={gs1 ? !gs1.isValid : undefined}
                          className="h-7 w-32 font-mono text-xs"
                          placeholder="Optional"
                        />
                      </td>
                      {(["retail_price", "cost_price", "current_stock"] as const).map((field) => (
                        <td key={field} className="px-1 py-1">
                          <Input
                            aria-label={`${field.replace("_", " ")} for ${Object.values(row.attributes).join(" ")}`}
                            type="number"
                            min={0}
                            step={field === "current_stock" ? "1" : "0.01"}
                            value={row[field]}
                            onChange={(e) => patch(row.key, { [field]: e.target.value })}
                            disabled={disabled}
                            className="h-7 w-20 font-mono text-xs"
                          />
                        </td>
                      ))}
                      <td className="px-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => onRowsChange(rows.filter((r) => r.key !== row.key))}
                          disabled={disabled}
                          aria-label="Remove variant"
                        >
                          <X />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
