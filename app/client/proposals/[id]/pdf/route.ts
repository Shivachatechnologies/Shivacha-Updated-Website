import { db } from "@/lib/db/client";
import { getPortalUser } from "@/lib/portal/session";
import { renderPdf, pdfResponse } from "@/lib/os/pdf";
import { proposalPdf } from "@/lib/sales/proposals";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await getPortalUser();
  if (!u) return new Response("Unauthorized", { status: 401 });
  const p = await db.proposal.findFirst({ where: { id: (await params).id, clientId: u.clientId, deletedAt: null, status: { in: ["SENT", "VIEWED", "ACCEPTED", "REJECTED", "EXPIRED"] } }, include: { items: true, client: true, deal: true } });
  if (!p) return new Response("Not found", { status: 404 });
  return pdfResponse(await renderPdf(proposalPdf(p)), `${p.number}-v${p.version}.pdf`);
}
