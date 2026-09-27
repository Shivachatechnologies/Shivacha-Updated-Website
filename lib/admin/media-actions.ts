"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { authorize, AuthError } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { deleteObject, putObject } from "@/lib/storage";

export type MediaState = { ok?: string; error?: string } | undefined;

const MAX_BYTES = 4 * 1024 * 1024;
const IMAGE_FORMATS: Record<string, { mime: string; ext: string }> = {
  jpeg: { mime: "image/jpeg", ext: "jpg" },
  png: { mime: "image/png", ext: "png" },
  webp: { mime: "image/webp", ext: "webp" },
  avif: { mime: "image/avif", ext: "avif" },
  heif: { mime: "image/avif", ext: "avif" },
  gif: { mime: "image/gif", ext: "gif" },
};

/**
 * Validates by content (magic bytes via sharp / %PDF header), never by the client-supplied type or
 * extension. SVG, HTML and every other type are rejected. Images are auto-rotated, stripped of
 * metadata (EXIF/GPS) and capped at 2560px.
 */
async function processUpload(file: File): Promise<{ body: Buffer; mime: string; ext: string; width?: number; height?: number }> {
  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.subarray(0, 5).toString("latin1") === "%PDF-") return { body: buf, mime: "application/pdf", ext: "pdf" };
  const sharp = (await import("sharp")).default;
  let meta;
  try {
    meta = await sharp(buf, { limitInputPixels: 50_000_000 }).metadata();
  } catch {
    throw new Error("UNSUPPORTED");
  }
  const fmt = meta.format && IMAGE_FORMATS[meta.format];
  if (!fmt || meta.format === ("svg" as string)) throw new Error("UNSUPPORTED");
  if (meta.format === "gif") return { body: buf, mime: fmt.mime, ext: fmt.ext, width: meta.width, height: meta.pageHeight ?? meta.height };
  const out = sharp(buf).rotate().resize({ width: 2560, height: 2560, fit: "inside", withoutEnlargement: true });
  const body = await (meta.format === "png" ? out.png({ compressionLevel: 9 }) : meta.format === "webp" ? out.webp({ quality: 85 }) : meta.format === "jpeg" ? out.jpeg({ quality: 85, mozjpeg: true }) : out.avif({ quality: 60 })).toBuffer({ resolveWithObject: true });
  return { body: body.data, mime: fmt.mime, ext: fmt.ext, width: body.info.width, height: body.info.height };
}

const cleanName = (n: string) => n.replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "file";

export async function uploadMediaAction(_: MediaState, form: FormData): Promise<MediaState> {
  try {
    const user = await authorize("media:manage");
    const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0).slice(0, 10);
    if (!files.length) return { error: "Choose at least one file." };
    const alt = z.string().trim().max(300).parse(form.get("alt") ?? "");
    let n = 0;
    for (const file of files) {
      if (file.size > MAX_BYTES) return { error: `${file.name} is larger than 4 MB.` };
      let p;
      try {
        p = await processUpload(file);
      } catch {
        return { error: `${file.name}: only JPG, PNG, WebP, AVIF, GIF and PDF files are allowed.` };
      }
      const key = `${new Date().toISOString().slice(0, 7)}-${randomBytes(6).toString("hex")}-${cleanName(file.name)}.${p.ext}`;
      const stored = await putObject(key, p.body, p.mime);
      const m = await db.media.create({ data: { key: stored.key, url: stored.url, filename: file.name.slice(0, 200), mimeType: p.mime, size: p.body.length, width: p.width, height: p.height, alt: alt || null, uploadedById: user.id } });
      await audit({ userId: user.id, action: "media.uploaded", entity: "media", entityId: m.id, metadata: { filename: m.filename, size: m.size, mimeType: m.mimeType } });
      n++;
    }
    revalidatePath("/admin/media");
    return { ok: `${n} file${n === 1 ? "" : "s"} uploaded.` };
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    if ((e as Error).message === "STORAGE_NOT_CONFIGURED") return { error: "Object storage is not configured. Set BLOB_READ_WRITE_TOKEN on the server." };
    console.error("[admin] upload failed", (e as Error).message);
    return { error: "Upload failed. Please try again." };
  }
}

export async function updateMediaAction(id: string, _: MediaState, form: FormData): Promise<MediaState> {
  try {
    const user = await authorize("media:manage");
    const data = z.object({ alt: z.string().trim().max(300), caption: z.string().trim().max(500) }).parse({ alt: form.get("alt") ?? "", caption: form.get("caption") ?? "" });
    await db.media.update({ where: { id }, data: { alt: data.alt || null, caption: data.caption || null } });
    await audit({ userId: user.id, action: "media.updated", entity: "media", entityId: id });
    revalidatePath("/admin/media");
    return { ok: "Saved." };
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    return { error: "Could not save." };
  }
}

export async function deleteMediaAction(id: string) {
  const user = await authorize("media:manage");
  const m = await db.media.findUnique({ where: { id } });
  if (m) {
    await db.media.delete({ where: { id } });
    await deleteObject({ key: m.key, url: m.url });
    await audit({ userId: user.id, action: "media.deleted", entity: "media", entityId: id, metadata: { filename: m.filename } });
  }
  revalidatePath("/admin/media");
  redirect("/admin/media?toast=File+deleted.");
}
