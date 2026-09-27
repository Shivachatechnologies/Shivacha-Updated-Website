import "server-only";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Object storage abstraction for the media library.
 * - Production: Vercel Blob (set BLOB_READ_WRITE_TOKEN). Other providers can be added behind the same interface.
 * - Local development only: files are written to public/uploads (git-ignored).
 */
export interface StoredObject {
  key: string;
  url: string;
}

const LOCAL_DIR = path.join(process.cwd(), "public", "uploads");

export function storageMode(): "blob" | "local" | "none" {
  if (process.env.BLOB_READ_WRITE_TOKEN) return "blob";
  if (process.env.NODE_ENV !== "production" || process.env.ALLOW_LOCAL_UPLOADS === "1") return "local";
  return "none";
}

export async function putObject(key: string, body: Buffer, contentType: string): Promise<StoredObject> {
  const mode = storageMode();
  if (mode === "blob") {
    const { put } = await import("@vercel/blob");
    const r = await put(`media/${key}`, body, { access: "public", contentType, addRandomSuffix: false });
    return { key: r.pathname, url: r.url };
  }
  if (mode === "local") {
    await mkdir(LOCAL_DIR, { recursive: true });
    await writeFile(path.join(LOCAL_DIR, path.basename(key)), body);
    return { key: `local/${path.basename(key)}`, url: `/uploads/${path.basename(key)}` };
  }
  throw new Error("STORAGE_NOT_CONFIGURED");
}

export async function deleteObject(obj: StoredObject) {
  try {
    if (obj.key.startsWith("local/")) await unlink(path.join(LOCAL_DIR, path.basename(obj.key)));
    else if (process.env.BLOB_READ_WRITE_TOKEN) {
      const { del } = await import("@vercel/blob");
      await del(obj.url);
    }
  } catch (e) {
    console.error("[storage] delete failed", (e as Error).message);
  }
}
