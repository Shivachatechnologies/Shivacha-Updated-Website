import { getPortalUser } from "@/lib/portal/session";
import { portalInvoice } from "@/lib/portal/data";
import { renderPdf, pdfResponse } from "@/lib/os/pdf";
import { invoicePdf } from "@/lib/finance/invoice-pdf";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await getPortalUser();
  if (!u) return new Response("Unauthorized", { status: 401 });
  const i = await portalInvoice(u, (await params).id);
  if (!i) return new Response("Not found", { status: 404 });
  return pdfResponse(await renderPdf(invoicePdf(i)), `${i.number}.pdf`);
}
