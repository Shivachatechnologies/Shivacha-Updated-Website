import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { db } from "@/lib/db/client";
import { siteConfig } from "@/data/siteConfig";
import { fmtMoney } from "@/lib/os/money";
import { logActivity } from "@/lib/os/activity";
import { notify } from "@/lib/os/notify";
import { hashToken, parseContent } from "@/lib/sales/proposals";
import { acceptProposalAction, declineProposalAction } from "@/lib/sales/public-proposal-actions";
import { PublicDecision } from "./decision";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Proposal", robots: { index: false, follow: false } };

const BOT = /bot|crawl|spider|preview|slack|whatsapp|telegram|discord|facebookexternalhit|linkedinbot|skype|curl|wget|headless/i;

export default async function SharedProposal({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!process.env.DATABASE_URL || !/^[\w-]{30,80}$/.test(token)) notFound();
  const p = await db.proposal.findUnique({ where: { shareTokenHash: hashToken(token) }, include: { items: { orderBy: { sortOrder: "asc" } } } });
  if (!p || p.deletedAt) notFound();
  const now = new Date();
  const lapsed = (p.shareExpiresAt && p.shareExpiresAt < now) || (p.validUntil && p.validUntil < now);
  let status = p.status;
  if (lapsed && (status === "SENT" || status === "VIEWED")) {
    await db.proposal.update({ where: { id: p.id }, data: { status: "EXPIRED" } });
    await logActivity({ type: "STATUS_CHANGED", summary: "Expired (validity date passed)", proposalId: p.id, dealId: p.dealId });
    status = "EXPIRED";
  }
  // View tracking — link-preview bots are ignored.
  const ua = (await headers()).get("user-agent") ?? "";
  if (!BOT.test(ua) && (status === "SENT" || status === "VIEWED")) {
    const first = !p.firstViewedAt;
    await db.proposal.update({ where: { id: p.id }, data: { viewCount: { increment: 1 }, lastViewedAt: now, ...(first && { firstViewedAt: now, status: "VIEWED" }) } });
    if (first) {
      await logActivity({ type: "VIEWED", summary: "Opened by the client for the first time", proposalId: p.id, dealId: p.dealId, clientId: p.clientId });
      await notify({ type: "proposal.viewed", title: `Proposal ${p.number} was opened`, href: `/admin/proposals/${p.id}`, userIds: [p.createdById] });
      status = "VIEWED";
    }
  }
  const c = parseContent(p.content);
  const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);
  const sections: [string, string, boolean][] = [["Scope of work", c.scope, false], ["Deliverables", c.deliverables, true], ["Timeline", c.timeline, true], ["Milestones", c.milestones, true], ["Assumptions", c.assumptions, true], ["Payment schedule", c.paymentSchedule, true], ["Terms", c.terms, true]];
  return (
    <main className="min-h-screen bg-[#f6f8fb] px-4 py-10 text-[#0b1424]">
      <article className="mx-auto max-w-3xl rounded-xl border border-[#dfe4ec] bg-white p-6 shadow-sm sm:p-10">
        <header className="border-b border-[#e6eaf0] pb-6">
          <p className="text-sm font-semibold">{siteConfig.name}</p>
          <p className="mt-6 font-mono text-xs tracking-wide text-[#2a5ce8] uppercase">Proposal {p.number} · v{p.version}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{p.title}</h1>
          <p className="mt-2 text-sm text-[#5b6577]">
            Prepared for {c.clientName || "you"}
            {c.clientContact ? ` · ${c.clientContact}` : ""} · valid until {p.validUntil ? p.validUntil.toISOString().slice(0, 10) : "—"}
          </p>
        </header>
        {c.summary && <p className="mt-6 whitespace-pre-wrap">{c.summary}</p>}
        {sections.filter(([, v]) => v).map(([h, v, list]) => (
          <section key={h} className="mt-7">
            <h2 className="text-base font-semibold">{h}</h2>
            {list ? (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-[15px] text-[#26303f]">{lines(v).map((l, i) => <li key={i}>{l.replace(/\s*\|\s*/g, " · ")}</li>)}</ul>
            ) : (
              <p className="mt-2 text-[15px] whitespace-pre-wrap text-[#26303f]">{v}</p>
            )}
          </section>
        ))}
        <section className="mt-8">
          <h2 className="text-base font-semibold">Pricing</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead className="text-left text-xs text-[#5b6577] uppercase"><tr><th className="py-2">Item</th><th className="py-2 text-right">Qty</th><th className="py-2 text-right">Unit</th><th className="py-2 text-right">Amount</th></tr></thead>
              <tbody>
                {p.items.map((i) => (
                  <tr key={i.id} className="border-t border-[#e6eaf0] align-top">
                    <td className="py-2 pr-3"><span className="font-medium">{i.name}</span>{i.description && <span className="block text-xs text-[#5b6577]">{i.description}</span>}</td>
                    <td className="py-2 text-right tabular-nums">{i.quantity.toString()}</td>
                    <td className="py-2 text-right tabular-nums">{fmtMoney(i.unitPrice, p.currency)}</td>
                    <td className="py-2 text-right tabular-nums">{fmtMoney(i.amount, p.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <dl className="mt-3 ml-auto max-w-xs space-y-1 text-sm">
            <div className="flex justify-between"><dt className="text-[#5b6577]">Subtotal</dt><dd className="tabular-nums">{fmtMoney(p.subtotal, p.currency)}</dd></div>
            {p.discountTotal.greaterThan(0) && <div className="flex justify-between"><dt className="text-[#5b6577]">Discounts</dt><dd className="tabular-nums">−{fmtMoney(p.discountTotal, p.currency)}</dd></div>}
            {p.taxTotal.greaterThan(0) && <div className="flex justify-between"><dt className="text-[#5b6577]">Tax</dt><dd className="tabular-nums">{fmtMoney(p.taxTotal, p.currency)}</dd></div>}
            <div className="flex justify-between border-t border-[#e6eaf0] pt-1 text-base font-semibold"><dt>Total</dt><dd className="tabular-nums">{fmtMoney(p.total, p.currency)}</dd></div>
          </dl>
        </section>
        <section className="mt-10 border-t border-[#e6eaf0] pt-6">
          {status === "ACCEPTED" ? (
            <p className="rounded-md bg-emerald-50 p-4 text-sm text-emerald-800">Accepted{p.acceptedByName ? ` by ${p.acceptedByName}` : ""}{p.acceptedAt ? ` on ${p.acceptedAt.toISOString().slice(0, 10)}` : ""}. Thank you.</p>
          ) : status === "REJECTED" ? (
            <p className="rounded-md bg-slate-50 p-4 text-sm text-slate-700">This proposal was declined. Contact {siteConfig.contact.email} if you would like to revisit it.</p>
          ) : status === "EXPIRED" ? (
            <p className="rounded-md bg-amber-50 p-4 text-sm text-amber-800">This proposal has expired. Contact {siteConfig.contact.email} for an updated version.</p>
          ) : (
            <PublicDecision accept={acceptProposalAction.bind(null, token)} decline={declineProposalAction.bind(null, token)} />
          )}
        </section>
      </article>
      <p className="mt-6 text-center text-xs text-[#8a93a3]">{siteConfig.legalName} · {siteConfig.url.replace(/^https?:\/\//, "")}</p>
    </main>
  );
}
