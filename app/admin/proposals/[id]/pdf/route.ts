import { db } from "@/lib/db/client";
import { getSessionUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { renderPdf, pdfResponse } from "@/lib/os/pdf";
import { proposalPdf } from "@/lib/sales/proposals";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!can(user.role, "proposals:view")) return new Response("Forbidden", { status: 403 });
  const { id } = await params;
  const p = await db.proposal.findUnique({ where: { id }, include: { items: true, client: true, deal: true } });
  if (!p || p.deletedAt) return new Response("Not found", { status: 404 });
  return pdfResponse(await renderPdf(proposalPdf(p)), `${p.number}-v${p.version}.pdf`);
}
