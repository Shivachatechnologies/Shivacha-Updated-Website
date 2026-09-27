"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { audit } from "@/lib/audit";
import { authorize } from "@/lib/auth/session";
import type { Permission } from "@/lib/auth/permissions";
import { fail, type ActionState } from "./action";
import { MAX_DOCUMENT_BYTES, safeName, sniffDocument, storeDocument } from "./documents";

export type DocTarget = { kind: "client" | "project" | "deal" | "contract" | "ticket"; id: string };

const MANAGE: Record<DocTarget["kind"], Permission> = { client: "clients:manage", project: "projects:manage", deal: "deals:manage", contract: "contracts:manage", ticket: "support:manage" };
const PATH: Record<DocTarget["kind"], (id: string) => string> = { client: (id) => `/admin/clients/${id}`, project: (id) => `/admin/projects/${id}`, deal: (id) => `/admin/deals/${id}`, contract: (id) => `/admin/contracts/${id}`, ticket: (id) => `/admin/support/${id}` };

/** Resolves the owning client so CLIENT-visible documents appear in the right portal (and only there). */
async function ownerClient(t: DocTarget): Promise<string | null> {
  if (t.kind === "client") return (await db.client.findUnique({ where: { id: t.id }, select: { id: true } }))?.id ?? null;
  if (t.kind === "project") return (await db.project.findUnique({ where: { id: t.id }, select: { clientId: true } }))?.clientId ?? null;
  if (t.kind === "deal") return (await db.deal.findUnique({ where: { id: t.id }, select: { clientId: true } }))?.clientId ?? null;
  if (t.kind === "contract") return (await db.contract.findUnique({ where: { id: t.id }, select: { clientId: true } }))?.clientId ?? null;
  return (await db.ticket.findUnique({ where: { id: t.id }, select: { clientId: true } }))?.clientId ?? null;
}

export async function uploadDocumentAction(target: DocTarget, _: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorize(MANAGE[target.kind]);
    const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0).slice(0, 5);
    if (!files.length) return { error: "Choose a file." };
    const visibility = z.enum(["INTERNAL", "CLIENT"]).catch("INTERNAL").parse(form.get("visibility"));
    const exists = await ownerClient(target);
    if (exists === null && target.kind === "client") return { error: "Client not found." };
    const clientId = exists;
    let n = 0;
    for (const file of files) {
      if (file.size > MAX_DOCUMENT_BYTES) return { error: `${file.name} is larger than 4 MB.` };
      const buf = Buffer.from(await file.arrayBuffer());
      const type = sniffDocument(buf, file.name);
      if (!type) return { error: `${file.name}: only PDF, images, Word/Excel/PowerPoint, ZIP, TXT and CSV files are accepted.` };
      let stored;
      try {
        stored = await storeDocument(buf, type.mime, type.ext);
      } catch (e) {
        if ((e as Error).message === "STORAGE_NOT_CONFIGURED") return { error: "File storage is not configured. Set BLOB_READ_WRITE_TOKEN (Vercel Blob) on the server." };
        throw e;
      }
      const doc = await db.document.create({
        data: {
          name: safeName(file.name),
          key: stored.key,
          url: stored.url,
          mimeType: type.mime,
          size: buf.length,
          visibility: target.kind === "ticket" ? "INTERNAL" : visibility,
          clientId,
          projectId: target.kind === "project" ? target.id : null,
          dealId: target.kind === "deal" ? target.id : null,
          contractId: target.kind === "contract" ? target.id : null,
          ticketId: target.kind === "ticket" ? target.id : null,
          uploadedById: user.id,
        },
      });
      await audit({ userId: user.id, action: "document.uploaded", entity: "Document", entityId: doc.id, metadata: { target: target.kind, targetId: target.id, visibility: doc.visibility } });
      n++;
    }
    revalidatePath(PATH[target.kind](target.id));
    return { ok: `${n} file${n === 1 ? "" : "s"} uploaded.` };
  } catch (e) {
    return fail(e, "documents");
  }
}

export async function setDocumentVisibilityAction(id: string, visibility: "INTERNAL" | "CLIENT") {
  const doc = await db.document.findUnique({ where: { id } });
  if (!doc) return;
  const kind: DocTarget["kind"] = doc.ticketId ? "ticket" : doc.contractId ? "contract" : doc.projectId ? "project" : doc.dealId ? "deal" : "client";
  const user = await authorize(MANAGE[kind]);
  await db.document.update({ where: { id }, data: { visibility } });
  await audit({ userId: user.id, action: "document.visibility", entity: "Document", entityId: id, metadata: { visibility } });
  revalidatePath("/admin", "layout");
}

/** Soft delete (the stored file is kept for audit/retention). */
export async function archiveDocumentAction(id: string) {
  const doc = await db.document.findUnique({ where: { id } });
  if (!doc) return;
  const kind: DocTarget["kind"] = doc.ticketId ? "ticket" : doc.contractId ? "contract" : doc.projectId ? "project" : doc.dealId ? "deal" : "client";
  const user = await authorize(MANAGE[kind]);
  await db.document.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit({ userId: user.id, action: "document.archived", entity: "Document", entityId: id });
  revalidatePath("/admin", "layout");
}
