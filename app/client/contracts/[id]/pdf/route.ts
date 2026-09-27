import { getPortalUser } from "@/lib/portal/session";
import { portalContract } from "@/lib/portal/data";
import { pdfMoney, pdfResponse, renderPdf } from "@/lib/os/pdf";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await getPortalUser();
  if (!u) return new Response("Unauthorized", { status: 401 });
  const c = await portalContract(u, (await params).id);
  if (!c) return new Response("Not found", { status: 404 });
  const d = (x: Date | null) => (x ? x.toISOString().slice(0, 10) : "—");
  return pdfResponse(
    await renderPdf({
      kind: "Contract",
      number: `${c.number} v${c.version}`,
      title: c.title,
      meta: [["Value", pdfMoney(c.value.toString(), c.currency)], ["Start", d(c.startDate)], ["End", d(c.endDate)], ["Renewal", d(c.renewalDate)]],
      billTo: [u.clientName],
      sections: [{ heading: "Terms", paragraphs: [c.terms ?? ""] }, ...(c.signatures.length ? [{ heading: "Signatures", bullets: c.signatures.map((s) => `${s.signerName} — ${s.status} ${d(s.signedAt)}`) }] : [])],
      watermark: c.status === "TERMINATED" ? "TERMINATED" : undefined,
    }),
    `${c.number}.pdf`,
  );
}
