/** CSV helpers with spreadsheet formula-injection protection (cells starting with = + - @ tab or CR are prefixed with '). */
export function csvCell(v: unknown): string {
  if (v == null) return "";
  let s = v instanceof Date ? v.toISOString() : typeof v === "object" ? JSON.stringify(v) : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const toCsvRow = (cells: unknown[]) => cells.map(csvCell).join(",") + "\r\n";

/**
 * RFC 4180 CSV parser (quoted fields, escaped quotes, CRLF/LF, BOM). Returns rows of raw strings.
 * Limits protect the server from oversized uploads.
 */
export function parseCsv(text: string, { maxRows = 5000, maxCols = 60 } = {}): string[][] {
  const src = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += c;
      continue;
    }
    if (c === '"' && cell === "") quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
      if (row.length > maxCols) throw new Error(`Too many columns (max ${maxCols})`);
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
      if (rows.length > maxRows + 1) throw new Error(`Too many rows (max ${maxRows})`);
    } else cell += c;
  }
  if (quoted) throw new Error("Unterminated quoted field");
  row.push(cell);
  if (row.some((x) => x.trim() !== "")) rows.push(row);
  return rows;
}

/** Undoes the export's formula-injection prefix ('=…) so round-tripped files import cleanly. */
export const uncsv = (v: string) => (/^'[=+\-@]/.test(v) ? v.slice(1) : v).trim();
