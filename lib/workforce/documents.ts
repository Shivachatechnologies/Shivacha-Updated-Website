import "server-only";
import { randomBytes } from "node:crypto";
import { documentStorageMode, readDocument, storeDocument } from "@/lib/os/documents";

/**
 * HR document storage. Vercel Blob private access is used when the store supports it; otherwise (and in development)
 * the existing business-document storage (unguessable key, URL kept server-side). Files are only ever served through
 * the authorised, audited route /admin/employees/documents/[id].
 */
export const HR_DOC_KINDS = { OFFER_LETTER: "Offer letter", EMPLOYMENT_AGREEMENT: "Employment agreement", NDA: "NDA", ID_DOCUMENT: "ID document", CERTIFICATE: "Certificate", PAYSLIP: "Payslip", OTHER: "Other HR document" } as const;
export type HrDocKind = keyof typeof HR_DOC_KINDS;
export const HR_DOC_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];

type Ref = { mode: "private" | "legacy"; key: string; url: string };

export async function storeHrDocument(buf: Buffer, mime: string, ext: string): Promise<string> {
  if (documentStorageMode() === "blob") {
    try {
      const { put } = await import("@vercel/blob");
      const r = await put(`hr/${Date.now().toString(36)}-${randomBytes(18).toString("base64url")}.${ext}`, buf, { access: "private", contentType: mime, addRandomSuffix: true });
      return JSON.stringify({ mode: "private", key: r.pathname, url: r.url } satisfies Ref);
    } catch (e) {
      console.warn("[hr-docs] private blob unavailable, using standard document storage", (e as Error).message);
    }
  }
  const r = await storeDocument(buf, mime, ext);
  return JSON.stringify({ mode: "legacy", key: r.key, url: r.url } satisfies Ref);
}

export async function readHrDocument(storageKey: string): Promise<Buffer> {
  const ref = JSON.parse(storageKey) as Ref;
  if (ref.mode === "private") {
    const { get } = await import("@vercel/blob");
    const r = await get(ref.key, { access: "private", useCache: false });
    if (!r || r.statusCode !== 200 || !r.stream) throw new Error("File not found in storage");
    return Buffer.from(await new Response(r.stream).arrayBuffer());
  }
  return readDocument(ref);
}

export async function deleteHrDocument(storageKey: string) {
  try {
    const ref = JSON.parse(storageKey) as Ref;
    if (ref.key.startsWith("local/")) return;
    const { del } = await import("@vercel/blob");
    await del(ref.url);
  } catch (e) {
    console.error("[hr-docs] delete failed", (e as Error).message);
  }
}
