import "server-only";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Business document storage (contracts, proposals, receipts, ticket attachments).
 * - Production: Vercel Blob under an unguessable key. The blob URL is stored server-side only; downloads always go
 *   through an authenticated route that re-checks permissions (admin) or tenant ownership (client portal).
 * - Development: files are written to .data/documents (git-ignored, never publicly served).
 */
export const MAX_DOCUMENT_BYTES = 4 * 1024 * 1024; // stays under Vercel's 4.5 MB request limit

const LOCAL_DIR = path.join(process.cwd(), ".data", "documents");

export function documentStorageMode(): "blob" | "local" | "none" {
  if (process.env.BLOB_READ_WRITE_TOKEN) return "blob";
  if (process.env.NODE_ENV !== "production" || process.env.ALLOW_LOCAL_UPLOADS === "1") return "local";
  return "none";
}

const TYPES: { mime: string; ext: string; test: (b: Buffer) => boolean }[] = [
  { mime: "application/pdf", ext: "pdf", test: (b) => b.subarray(0, 5).toString("latin1") === "%PDF-" },
  { mime: "image/png", ext: "png", test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: "image/jpeg", ext: "jpg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: "image/webp", ext: "webp", test: (b) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP" },
  { mime: "image/gif", ext: "gif", test: (b) => b.subarray(0, 4).toString("latin1") === "GIF8" },
  // Office Open XML (docx/xlsx/pptx) are ZIP containers; the extension decides the declared type.
  { mime: "application/zip", ext: "zip", test: (b) => b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04 },
];
const OOXML: Record<string, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};
const TEXT: Record<string, string> = { txt: "text/plain", csv: "text/csv" };

/** Detects the real type from content. SVG/HTML/scripts/executables are rejected. */
export function sniffDocument(buf: Buffer, filename: string): { mime: string; ext: string } | null {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  const hit = TYPES.find((t) => t.test(buf));
  if (hit?.ext === "zip") return OOXML[ext] ? { mime: OOXML[ext], ext } : { mime: "application/zip", ext: "zip" };
  if (hit) return hit;
  if (TEXT[ext]) {
    const sample = buf.subarray(0, 4096).toString("utf8");
    if (sample.includes("\u0000") || /<\s*(script|html|svg|iframe)/i.test(sample)) return null;
    return { mime: TEXT[ext], ext };
  }
  return null;
}

export const safeName = (n: string) => n.replace(/[^\w.\- ()]+/g, "_").replace(/^\.+/, "").slice(0, 120) || "document";

export async function storeDocument(buf: Buffer, mime: string, ext: string): Promise<{ key: string; url: string }> {
  const id = `${Date.now().toString(36)}-${randomBytes(18).toString("base64url")}.${ext}`;
  const mode = documentStorageMode();
  if (mode === "blob") {
    const { put } = await import("@vercel/blob");
    const r = await put(`documents/${id}`, buf, { access: "public", contentType: mime, addRandomSuffix: true });
    return { key: r.pathname, url: r.url };
  }
  if (mode === "local") {
    await mkdir(LOCAL_DIR, { recursive: true });
    await writeFile(path.join(LOCAL_DIR, id), buf);
    return { key: `local/${id}`, url: `local/${id}` };
  }
  throw new Error("STORAGE_NOT_CONFIGURED");
}

/** Reads a stored document for an authorised download. */
export async function readDocument(doc: { key: string; url: string }): Promise<Buffer> {
  if (doc.key.startsWith("local/")) return readFile(path.join(LOCAL_DIR, path.basename(doc.key)));
  const res = await fetch(doc.url, { cache: "no-store", signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Storage responded ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

export function downloadResponse(buf: Buffer, doc: { name: string; mimeType: string }, inline = false) {
  const disposition = inline && (doc.mimeType === "application/pdf" || doc.mimeType.startsWith("image/")) ? "inline" : "attachment";
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": doc.mimeType,
      "Content-Disposition": `${disposition}; filename="${safeName(doc.name).replace(/"/g, "")}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
