import ExcelJS from "exceljs";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { ReportColumn } from "./catalog";

/**
 * CWE-1236 formula-injection guard: a cell value beginning with =, +, -, or @
 * is interpreted as a formula by Excel/Sheets/LibreOffice when the file is
 * opened, which can execute arbitrary commands via DDE. Prefixing with a
 * single quote forces it to be read as literal text in every major
 * spreadsheet app, without visibly altering the value once opened.
 */
const FORMULA_PREFIXES = ["=", "+", "-", "@"];
export function sanitizeCellValue(value: unknown): string {
  const str = value == null ? "" : String(value);
  if (str.length > 0 && FORMULA_PREFIXES.includes(str[0])) {
    return `'${str}`;
  }
  return str;
}

function formatCellForDisplay(value: unknown, type: ReportColumn["type"]): string {
  if (value == null) return "";
  if (type === "currency" && typeof value === "number") return value.toFixed(2);
  if (type === "percent" && typeof value === "number") return `${value.toFixed(2)}%`;
  return String(value);
}

function csvEscape(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** RFC 4180 body, formula-injection-sanitized — pure and Node-testable; exportToCsv adds the BOM + triggers the browser download. */
export function buildCsvString(columns: ReportColumn[], rows: Record<string, unknown>[]): string {
  const header = columns.map((c) => csvEscape(sanitizeCellValue(c.label))).join(",");
  const body = rows
    .map((row) =>
      columns
        .map((c) => csvEscape(sanitizeCellValue(formatCellForDisplay(row[c.key], c.type))))
        .join(",")
    )
    .join("\r\n");
  return `${header}\r\n${body}`;
}

/** RFC 4180 + a UTF-8 BOM so Excel on Windows renders non-ASCII correctly, and formula-injection-sanitized. */
export function exportToCsv(columns: ReportColumn[], rows: Record<string, unknown>[], filename: string): void {
  const csv = buildCsvString(columns, rows);
  const blob = new Blob(["﻿", csv], { type: "text/csv;charset=utf-8;" });
  triggerDownload(blob, filename);
}

/** Pure workbook-buffer builder — Node-testable (no DOM/download); exportToExcel wraps this with the browser download trigger. */
export async function buildExcelWorkbook(
  columns: ReportColumn[],
  rows: Record<string, unknown>[],
  sheetName = "Report"
): Promise<{ workbook: ExcelJS.Workbook; buffer: ExcelJS.Buffer }> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);

  sheet.columns = columns.map((c) => ({ header: c.label, key: c.key, width: Math.max(12, c.label.length + 4) }));
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  const headerRow = sheet.getRow(1);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF334155" } }; // slate-700
    cell.alignment = { vertical: "middle" };
  });

  rows.forEach((row, index) => {
    const values: Record<string, string | number> = {};
    for (const col of columns) {
      const raw = row[col.key];
      values[col.key] = typeof raw === "number" ? raw : sanitizeCellValue(raw);
    }
    const addedRow = sheet.addRow(values);
    if (index % 2 === 1) {
      addedRow.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } }; // slate-100
      });
    }
    for (const col of columns) {
      if (col.type === "currency") {
        addedRow.getCell(col.key).numFmt = "$#,##0.00";
      } else if (col.type === "percent") {
        addedRow.getCell(col.key).numFmt = '0.00"%"';
      }
    }
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return { workbook, buffer };
}

export async function exportToExcel(
  columns: ReportColumn[],
  rows: Record<string, unknown>[],
  filename: string,
  sheetName = "Report"
): Promise<void> {
  const { buffer } = await buildExcelWorkbook(columns, rows, sheetName);
  triggerDownload(
    new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    filename
  );
}

interface PdfMeta {
  title: string;
  storeName: string;
  timezone: string;
  kpiSummary?: { label: string; value: string }[];
}

/** Template A: A4 landscape executive report. */
export function exportToPdfA4(columns: ReportColumn[], rows: Record<string, unknown>[], meta: PdfMeta, filename: string): void {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const runAt = new Date().toLocaleString();

  doc.setFontSize(16);
  doc.text(meta.title, 40, 40);
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`${meta.storeName} · Generated ${runAt} · ${meta.timezone}`, 40, 58);

  let startY = 75;
  if (meta.kpiSummary?.length) {
    doc.setFontSize(9);
    doc.setTextColor(30);
    const kpiText = meta.kpiSummary.map((k) => `${k.label}: ${k.value}`).join("    |    ");
    doc.text(kpiText, 40, startY);
    startY += 20;
  }

  autoTable(doc, {
    startY,
    head: [columns.map((c) => c.label)],
    body: rows.map((row) => columns.map((c) => formatCellForDisplay(row[c.key], c.type))),
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [51, 65, 85] },
    didDrawPage: () => {
      const pageCount = doc.getNumberOfPages();
      const current = doc.getCurrentPageInfo().pageNumber;
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(`Page ${current} of ${pageCount}`, doc.internal.pageSize.getWidth() - 80, doc.internal.pageSize.getHeight() - 20);
    },
  });

  doc.save(filename);
}

/** Template B: 80mm thermal receipt-roll audit slip — same width convention as POS receipts (app/globals.css #receipt-print-area). */
export function exportToPdfThermal(columns: ReportColumn[], rows: Record<string, unknown>[], meta: PdfMeta, filename: string): void {
  const widthPt = 227; // 80mm
  const heightPt = Math.max(400, 80 + rows.length * 26 + 40);
  const doc = new jsPDF({ unit: "pt", format: [widthPt, heightPt] });

  doc.setFont("courier", "normal");
  doc.setFontSize(9);
  let y = 20;
  doc.text(meta.storeName, widthPt / 2, y, { align: "center" });
  y += 12;
  doc.text(meta.title, widthPt / 2, y, { align: "center" });
  y += 12;
  doc.text(new Date().toLocaleString(), widthPt / 2, y, { align: "center" });
  y += 10;
  doc.line(10, y, widthPt - 10, y);
  y += 14;

  doc.setFontSize(7);
  for (const row of rows) {
    const line = columns.map((c) => formatCellForDisplay(row[c.key], c.type)).join(" · ");
    const wrapped = doc.splitTextToSize(line, widthPt - 20);
    doc.text(wrapped, 10, y);
    y += wrapped.length * 9 + 4;
  }

  doc.save(filename);
}

/** Line-delimited JSON for warehouse/BI ingestion — one object per line, no wrapping array. */
export function exportToJsonl(rows: Record<string, unknown>[], filename: string): void {
  const lines = rows.map((row) => JSON.stringify(row)).join("\n");
  const blob = new Blob([lines], { type: "application/x-ndjson;charset=utf-8;" });
  triggerDownload(blob, filename);
}
