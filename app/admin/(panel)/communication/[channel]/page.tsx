import { notFound } from "next/navigation";
import { db } from "@/lib/db/client";
import { requireAccess } from "@/lib/os/guard";
import { channels } from "@/lib/communication/providers";
import { setMeetingStatusAction } from "@/lib/communication/actions";
import { LinkCell, ListView, NotConnected, StatusBadge, pageOf, str, PAGE_SIZE, type SP } from "@/components/admin/os";
import { fmtDate, label } from "@/components/admin/ui";

export const metadata = { title: "Communication" };
const MAP = { email: "EMAIL", whatsapp: "WHATSAPP", meetings: "MEETING" } as const;

export default async function ChannelPage({ params, searchParams }: { params: Promise<{ channel: string }>; searchParams: Promise<SP> }) {
  await requireAccess("communication:view", "COMMUNICATION");
  const { channel } = await params;
  const ch = MAP[channel as keyof typeof MAP];
  if (!ch) notFound();
  const sp = await searchParams;
  const values = { q: str(sp, "q", 80), upcoming: str(sp, "upcoming", 1), page: str(sp, "page") };
  const now = new Date();
  const where = { channel: ch, ...(values.upcoming && { scheduledAt: { gte: now }, status: "SCHEDULED" as const }), ...(values.q && { OR: [{ subject: { contains: values.q, mode: "insensitive" as const } }, { body: { contains: values.q, mode: "insensitive" as const } }] }) };
  const page = pageOf(sp);
  const [total, rows] = await Promise.all([db.communication.count({ where }), db.communication.findMany({ where, orderBy: { occurredAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, include: { lead: { select: { id: true, name: true } }, client: { select: { id: true, name: true } }, user: { select: { name: true } } } })]);
  const status = channels().find((c) => c.key === (ch === "EMAIL" ? "email" : "whatsapp"));
  const title = ch === "MEETING" ? "Meetings" : ch === "EMAIL" ? "Email" : "WhatsApp";
  return (
    <ListView
      title={title}
      description={ch === "MEETING" ? "Meetings scheduled or logged with leads and clients (incl. Calendly bookings when connected)." : `${title} sent from Shivacha OS and conversations logged by the team. Compose from a lead or client page.`}
      crumbs={[{ label: "Communication", href: "/admin/communication" }, { label: title }]}
      above={ch !== "MEETING" && status && !status.connected ? <div className="mb-4"><NotConnected name={status.name} env={status.env}>{ch === "WHATSAPP" ? "Use the wa.me links on lead pages and log conversations; nothing is sent automatically." : "Emails cannot be sent until outgoing mail is configured. Conversations can still be logged."}</NotConnected></div> : undefined}
      values={values}
      filters={[{ type: "search", name: "q", placeholder: "Search…" }, ...(ch === "MEETING" ? [{ type: "select" as const, name: "upcoming", label: "All meetings", options: [["1", "Upcoming"]] as const }] : [])]}
      rows={rows}
      total={total}
      page={page}
      basePath={`/admin/communication/${channel}`}
      empty={{ title: `No ${title.toLowerCase()} yet` }}
      columns={[
        { header: ch === "MEETING" ? "Time" : "When", cell: (c) => <span className={`whitespace-nowrap ${c.scheduledAt && c.scheduledAt > now ? "text-fg" : "text-muted"}`}>{fmtDate(c.scheduledAt ?? c.occurredAt, true)}</span> },
        { header: "Subject", cell: (c) => <span className="block max-w-[320px] truncate">{c.subject ?? c.body?.slice(0, 80) ?? "—"}{c.meetingUrl && <a href={c.meetingUrl} target="_blank" rel="noopener noreferrer" className="ml-2 text-xs text-brand-blue hover:underline">Join</a>}</span> },
        { header: "With", cell: (c) => (c.lead ? <LinkCell href={`/admin/leads/${c.lead.id}`}>{c.lead.name}</LinkCell> : c.client ? <LinkCell href={`/admin/clients/${c.client.id}`}>{c.client.name}</LinkCell> : <span className="text-muted">{c.toAddress ?? "—"}</span>) },
        { header: "Status", cell: (c) => <StatusBadge value={c.status} /> },
        { header: "Direction", cell: (c) => <span className="text-muted">{label(c.direction)}</span> },
        { header: "", cell: (c) => (ch === "MEETING" && c.status === "SCHEDULED" ? <span className="flex gap-2 text-xs"><form action={setMeetingStatusAction.bind(null, c.id, "COMPLETED")}><button type="submit" className="text-muted hover:text-fg">Done</button></form><form action={setMeetingStatusAction.bind(null, c.id, "CANCELLED")}><button type="submit" className="text-muted hover:text-red-700">Cancel</button></form></span> : null) },
      ]}
    />
  );
}
