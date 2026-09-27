import Link from "next/link";
import { db } from "@/lib/db/client";
import type { Prisma } from "@/lib/generated/prisma/client";
import { requireAccess } from "@/lib/os/guard";
import { channels } from "@/lib/communication/providers";
import { LinkCell, ListView, StatusBadge, pageOf, pick, str, PAGE_SIZE, type SP } from "@/components/admin/os";
import { fmtDate, label } from "@/components/admin/ui";

export const metadata = { title: "Communication" };
const CH = ["EMAIL", "WHATSAPP", "MEETING", "SMS", "NOTE"] as const;

export default async function CommunicationPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAccess("communication:view", "COMMUNICATION");
  const sp = await searchParams;
  const values = { q: str(sp, "q", 80), channel: pick(sp, "channel", CH), direction: pick(sp, "direction", ["INBOUND", "OUTBOUND", "INTERNAL"] as const), page: str(sp, "page") };
  const where: Prisma.CommunicationWhereInput = { ...(values.channel && { channel: values.channel }), ...(values.direction && { direction: values.direction }), ...(values.q && { OR: [{ subject: { contains: values.q, mode: "insensitive" } }, { body: { contains: values.q, mode: "insensitive" } }, { toAddress: { contains: values.q, mode: "insensitive" } }, { fromAddress: { contains: values.q, mode: "insensitive" } }] }) };
  const page = pageOf(sp);
  const [total, rows] = await Promise.all([db.communication.count({ where }), db.communication.findMany({ where, orderBy: { occurredAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, include: { lead: { select: { id: true, name: true } }, client: { select: { id: true, name: true } }, user: { select: { name: true } } } })]);
  const ch = channels();
  return (
    <ListView
      title="Communication"
      description="Every email, WhatsApp message, meeting and portal message across leads and clients. Calls have their own log."
      crumbs={[{ label: "Communication" }]}
      above={
        <div className="mb-4 flex flex-wrap gap-2 text-xs">
          {ch.map((c) => <span key={c.key} className="rounded-md border border-line px-2 py-1"><StatusBadge value={c.connected ? "CONNECTED" : "NOT_CONNECTED"} text={c.connected ? "Connected" : "Not connected"} /> <span className="ml-1 text-muted">{c.name}</span></span>)}
          <Link href="/admin/integrations" className="px-2 py-1 text-brand-blue hover:underline">Integrations →</Link>
        </div>
      }
      values={values}
      filters={[{ type: "search", name: "q", placeholder: "Search subject, body, address…" }, { type: "select", name: "channel", label: "All channels", options: CH.map((c) => [c, label(c)] as const) }, { type: "select", name: "direction", label: "Any direction", options: [["INBOUND", "Inbound"], ["OUTBOUND", "Outbound"], ["INTERNAL", "Internal"]] }]}
      rows={rows}
      total={total}
      page={page}
      basePath="/admin/communication"
      empty={{ title: "No communication yet", description: "Emails, WhatsApp messages, meetings and logged conversations appear here." }}
      columns={[
        { header: "When", cell: (c) => <span className="whitespace-nowrap text-muted">{fmtDate(c.occurredAt, true)}</span> },
        { header: "Channel", cell: (c) => <span className="font-mono text-[11px] uppercase">{c.channel}{c.provider === "portal" ? " · portal" : ""}</span> },
        { header: "Subject", cell: (c) => <span className="block max-w-[320px] truncate">{c.subject ?? c.body?.slice(0, 80) ?? "—"}</span> },
        { header: "With", cell: (c) => (c.lead ? <LinkCell href={`/admin/leads/${c.lead.id}`}>{c.lead.name}</LinkCell> : c.client ? <LinkCell href={`/admin/clients/${c.client.id}`}>{c.client.name}</LinkCell> : <span className="text-muted">{c.toAddress ?? c.fromAddress ?? "—"}</span>) },
        { header: "Direction", cell: (c) => <span className="text-muted">{label(c.direction)}</span> },
        { header: "Status", cell: (c) => <StatusBadge value={c.status} /> },
        { header: "By", cell: (c) => <span className="text-muted">{c.user?.name ?? "—"}</span> },
      ]}
    />
  );
}
