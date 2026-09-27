import "server-only";
import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { siteConfig } from "@/data/siteConfig";

/**
 * Server-side PDF documents (proposals, quotes, invoices, contracts, reports) with pdf-lib.
 * Standard fonts only support WinAnsi, so text is sanitised and money is printed with ISO codes ("USD 1,200.00").
 */
export interface PdfLine {
  name: string;
  description?: string | null;
  quantity: string;
  unitPrice: string;
  discountPct?: string;
  taxPct?: string;
  amount: string;
}
export interface PdfSection {
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
  table?: { head: string[]; rows: string[][]; widths?: number[] };
}
export interface PdfDoc {
  kind: string;
  number: string;
  title: string;
  meta: [string, string][];
  billTo?: string[];
  sections?: PdfSection[];
  lines?: PdfLine[];
  totals?: [string, string][];
  footerNote?: string;
  watermark?: string;
}

const WINANSI_EXTRA = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";
const MAP: Record<string, string> = { "→": "->", "←": "<-", "≤": "<=", "≥": ">=", "≈": "~", "✓": "v", "✔": "v", "×": "x", "₹": "INR ", "\u202f": " ", "\u2009": " " };
export function winAnsi(s: string) {
  let out = "";
  for (const ch of s.normalize("NFC")) {
    const c = ch.codePointAt(0)!;
    if (ch === "\n" || (c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || WINANSI_EXTRA.includes(ch)) out += ch;
    else if (MAP[ch] !== undefined) out += MAP[ch];
    else if (ch === "\t") out += "  ";
    else out += "?";
  }
  return out;
}

export function pdfMoney(v: string | number, currency: string) {
  const n = Number(v);
  return `${currency} ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const A4: [number, number] = [595.28, 841.89];
const M = 48;
const INK = rgb(0.07, 0.1, 0.16);
const MUTED = rgb(0.38, 0.42, 0.5);
const LINE = rgb(0.86, 0.88, 0.91);
const BRAND = rgb(0.13, 0.36, 0.93);

class Writer {
  page!: PDFPage;
  y = 0;
  pages: PDFPage[] = [];
  constructor(private doc: PDFDocument, public font: PDFFont, public bold: PDFFont, private header: string) {
    this.newPage();
  }
  newPage() {
    this.page = this.doc.addPage(A4);
    this.pages.push(this.page);
    this.y = A4[1] - M;
    if (this.pages.length > 1) {
      this.text(this.header, { size: 8, color: MUTED });
      this.y -= 8;
    }
  }
  ensure(h: number) {
    if (this.y - h < M + 24) this.newPage();
  }
  wrap(text: string, size: number, width: number, font = this.font) {
    const out: string[] = [];
    for (const para of winAnsi(text).split("\n")) {
      let line = "";
      for (const word of para.split(/\s+/)) {
        const t = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(t, size) <= width) line = t;
        else {
          if (line) out.push(line);
          line = word;
          while (font.widthOfTextAtSize(line, size) > width && line.length > 1) {
            let cut = line.length - 1;
            while (cut > 1 && font.widthOfTextAtSize(line.slice(0, cut), size) > width) cut--;
            out.push(line.slice(0, cut));
            line = line.slice(cut);
          }
        }
      }
      out.push(line);
    }
    return out;
  }
  text(s: string, o: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; x?: number; width?: number; lead?: number } = {}) {
    const size = o.size ?? 10;
    const font = o.bold ? this.bold : this.font;
    const lines = this.wrap(s, size, o.width ?? A4[0] - 2 * M - (o.x ?? 0), font);
    for (const l of lines) {
      this.ensure(size * 1.4);
      this.page.drawText(l, { x: M + (o.x ?? 0), y: this.y - size, size, font, color: o.color ?? INK });
      this.y -= size * (o.lead ?? 1.45);
    }
  }
  rule(color = LINE) {
    this.page.drawLine({ start: { x: M, y: this.y }, end: { x: A4[0] - M, y: this.y }, thickness: 0.7, color });
    this.y -= 8;
  }
  table(head: string[], rows: string[][], widths: number[], align: ("l" | "r")[] = []) {
    const W = A4[0] - 2 * M;
    const cols = widths.map((w) => w * W);
    const row = (cells: string[], bold: boolean) => {
      const wrapped = cells.map((c, i) => this.wrap(c, 9, cols[i] - 8, bold ? this.bold : this.font));
      const h = Math.max(...wrapped.map((w) => w.length)) * 12 + 6;
      this.ensure(h);
      let x = M;
      wrapped.forEach((lines, i) => {
        lines.forEach((l, j) => {
          const f = bold ? this.bold : this.font;
          const tx = align[i] === "r" ? x + cols[i] - 4 - f.widthOfTextAtSize(l, 9) : x + 4;
          this.page.drawText(l, { x: tx, y: this.y - 12 - j * 12, size: 9, font: f, color: bold ? MUTED : INK });
        });
        x += cols[i];
      });
      this.y -= h;
      this.page.drawLine({ start: { x: M, y: this.y }, end: { x: A4[0] - M, y: this.y }, thickness: 0.5, color: LINE });
    };
    row(head, true);
    for (const r of rows) row(r, false);
    this.y -= 6;
  }
}

export async function renderPdf(d: PdfDoc): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(winAnsi(`${d.kind} ${d.number} — ${d.title}`));
  doc.setAuthor(siteConfig.name);
  doc.setCreator("Shivacha OS");
  doc.setProducer("Shivacha OS");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const w = new Writer(doc, font, bold, `${siteConfig.name} · ${d.kind} ${d.number}`);

  // Header
  w.page.drawRectangle({ x: 0, y: A4[1] - 6, width: A4[0], height: 6, color: BRAND });
  w.text(siteConfig.name, { size: 16, bold: true });
  w.text(`${siteConfig.legalName} · ${siteConfig.contact.email} · ${siteConfig.url.replace(/^https?:\/\//, "")}`, { size: 8.5, color: MUTED });
  w.y -= 10;
  w.text(`${d.kind.toUpperCase()} ${d.number}`, { size: 9, bold: true, color: BRAND });
  w.text(d.title, { size: 18, bold: true, lead: 1.3 });
  w.y -= 4;
  const metaTop = w.y;
  for (const [k, v] of d.meta) w.text(`${k}: ${v}`, { size: 9.5, width: 260 });
  const metaBottom = w.y;
  if (d.billTo?.length) {
    w.y = metaTop;
    w.text("Prepared for", { size: 8.5, bold: true, color: MUTED, x: 290, width: 210 });
    for (const l of d.billTo) w.text(l, { size: 9.5, x: 290, width: 210 });
    w.y = Math.min(w.y, metaBottom);
  }
  w.y -= 6;
  w.rule();

  for (const s of d.sections ?? []) {
    w.ensure(40);
    w.y -= 4;
    w.text(s.heading, { size: 11.5, bold: true });
    for (const p of s.paragraphs ?? []) if (p.trim()) w.text(p, { size: 9.5, color: INK });
    for (const b of s.bullets ?? []) if (b.trim()) w.text(`•  ${b}`, { size: 9.5, x: 6 });
    if (s.table?.rows.length) w.table(s.table.head, s.table.rows, s.table.widths ?? s.table.head.map(() => 1 / s.table!.head.length));
    w.y -= 4;
  }

  if (d.lines?.length) {
    w.ensure(60);
    w.y -= 4;
    w.text("Pricing", { size: 11.5, bold: true });
    w.table(
      ["Item", "Qty", "Unit price", "Disc.", "Tax", "Amount"],
      d.lines.map((l) => [l.description ? `${l.name}\n${l.description}` : l.name, l.quantity, l.unitPrice, `${l.discountPct ?? "0"}%`, `${l.taxPct ?? "0"}%`, l.amount]),
      [0.42, 0.08, 0.15, 0.08, 0.08, 0.19],
      ["l", "r", "r", "r", "r", "r"],
    );
  }
  if (d.totals?.length) {
    for (const [k, v] of d.totals) {
      w.ensure(16);
      const last = k === d.totals[d.totals.length - 1][0];
      const f = last ? bold : font;
      const size = last ? 11 : 9.5;
      const vw = f.widthOfTextAtSize(winAnsi(v), size);
      w.page.drawText(winAnsi(k), { x: A4[0] - M - 230, y: w.y - size, size, font: f, color: last ? INK : MUTED });
      w.page.drawText(winAnsi(v), { x: A4[0] - M - vw, y: w.y - size, size, font: f, color: INK });
      w.y -= size * 1.6;
    }
  }
  if (d.footerNote) {
    w.y -= 8;
    w.text(d.footerNote, { size: 8.5, color: MUTED });
  }

  const total = w.pages.length;
  w.pages.forEach((p, i) => {
    const t = winAnsi(`${siteConfig.name} · ${d.kind} ${d.number} · Page ${i + 1} of ${total}`);
    p.drawText(t, { x: M, y: 24, size: 7.5, font, color: MUTED });
    if (d.watermark) p.drawText(winAnsi(d.watermark), { x: 150, y: 380, size: 64, font: bold, color: rgb(0.9, 0.2, 0.2), opacity: 0.12, rotate: degrees(35) });
  });
  return doc.save();
}

export const pdfResponse = (bytes: Uint8Array, filename: string, inline = true) =>
  new Response(new Uint8Array(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${filename.replace(/[^\w.-]+/g, "_")}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
