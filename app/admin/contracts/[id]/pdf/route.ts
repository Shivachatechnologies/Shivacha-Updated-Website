import { db } from "@/lib/db/client";
import { getSessionUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { pdfMoney, pdfResponse, renderPdf } from "@/lib/os/pdf";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!can(user.role, "contracts:view")) return new Response("Forbidden", { status: 403 });
  const { id } = await params;
  const c = await db.contract.findUnique({ where: { id }, include: { client: true, signatures: true } });
  if (!c || c.deletedAt) return new Response("Not found", { status: 404 });
  const d = (x: Date | null) => (x ? x.toISOString().slice(0, 10) : "—");
  const bytes = await renderPdf({
    kind: "Contract",
    number: `${c.number} v${c.version}`,
    title: c.title,
    meta: [["Value", pdfMoney(c.value.toString(), c.currency)], ["Start", d(c.startDate)], ["End", d(c.endDate)], ["Renewal", d(c.renewalDate)]],
    billTo: [c.client.name, c.client.legalName ?? "", c.client.address ?? ""].filter(Boolean),
    sections: [
      { heading: "Terms", paragraphs: [c.terms ?? "No terms entered."] },
      ...(c.signatures.length ? [{ heading: "Signatures", bullets: c.signatures.map((s) => `${s.signerName} (${s.signerEmail}) — ${s.status} ${d(s.signedAt)}`) }] : []),
    ],
    watermark: c.status === "DRAFT" ? "DRAFT" : c.status === "TERMINATED" ? "TERMINATED" : undefined,
  });
  return pdfResponse(bytes, `${c.number}-v${c.version}.pdf`);
}
