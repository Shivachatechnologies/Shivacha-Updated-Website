import { db } from "@/lib/db/client";
import { getSessionUser } from "@/lib/auth/session";
import { can, type Permission } from "@/lib/auth/permissions";
import { audit } from "@/lib/audit";
import { downloadResponse, readDocument } from "@/lib/os/documents";

export const dynamic = "force-dynamic";

/** Authenticated document download. The caller needs view access to at least one record the file belongs to. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const doc = await db.document.findUnique({ where: { id } });
  if (!doc || doc.deletedAt) return new Response("Not found", { status: 404 });
  const need: Permission[] = [doc.ticketId && "support:view", doc.projectId && "projects:view", doc.contractId && "contracts:view", doc.dealId && "deals:view", doc.clientId && "clients:view"].filter(Boolean) as Permission[];
  if (!need.length || !need.some((p) => can(user.role, p))) return new Response("Forbidden", { status: 403 });
  try {
    const buf = await readDocument(doc);
    await audit({ userId: user.id, action: "document.downloaded", entity: "Document", entityId: doc.id });
    return downloadResponse(buf, doc, new URL(req.url).searchParams.get("inline") === "1");
  } catch (e) {
    console.error("[documents] read failed", (e as Error).message);
    return new Response("The file could not be read.", { status: 502 });
  }
}
