import Papa from "papaparse";

export interface ParsedCsv {
  headers: string[];
  rows: Record<string, string>[];
  errors: { row: number; message: string }[];
}

/** Client-side only: parsing is pure and needs no DB access, so it never
 * touches a Server Action — only the resolved rows do (see bulkImport.ts). */
export function parseCsvText(text: string): ParsedCsv {
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase(),
  });

  return {
    headers: result.meta.fields ?? [],
    rows: result.data,
    // +2: 1-indexed rows, plus the header row itself, so this matches the
    // line number a user would see opening the file in a spreadsheet app.
    errors: result.errors.map((e) => ({ row: (e.row ?? -1) + 2, message: e.message })),
  };
}
