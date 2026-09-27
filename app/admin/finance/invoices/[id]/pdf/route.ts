import { db } from "@/lib/db/client";
import { getSessionUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { renderPdf, pdfResponse } from "@/lib/os/pdf";
import { invoicePdf } from "@/lib/finance/invoice-pdf";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!can(user.role, "finance:view")) return new Response("Forbidden", { status: 403 });
  const i = await db.invoice.findUnique({ where: { id: (await params).id }, include: { items: true, client: true } });
  if (!i) return new Response("Not found", { status: 404 });
  return pdfResponse(await renderPdf(invoicePdf(i)), `${i.number}.pdf`);
}
