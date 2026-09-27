import { getPortalUser } from "@/lib/portal/session";
import { portalDocument } from "@/lib/portal/data";
import { audit } from "@/lib/audit";
import { downloadResponse, readDocument } from "@/lib/os/documents";

export const dynamic = "force-dynamic";

/** Tenant-isolated download: the document must belong to the signed-in portal user's client and be client-visible. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await getPortalUser();
  if (!u) return new Response("Unauthorized", { status: 401 });
  const doc = await portalDocument(u, (await params).id);
  if (!doc) return new Response("Not found", { status: 404 });
  try {
    const buf = await readDocument(doc);
    await audit({ action: "portal.document_downloaded", entity: "Document", entityId: doc.id, metadata: { portalUserId: u.id } });
    return downloadResponse(buf, doc);
  } catch {
    return new Response("The file could not be read.", { status: 502 });
  }
}
