/** CSV helpers with spreadsheet formula-injection protection (cells starting with = + - @ tab or CR are prefixed with '). */
export function csvCell(v: unknown): string {
  if (v == null) return "";
  let s = v instanceof Date ? v.toISOString() : typeof v === "object" ? JSON.stringify(v) : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const toCsvRow = (cells: unknown[]) => cells.map(csvCell).join(",") + "\r\n";
