import Link from "next/link";
import { db } from "@/lib/db/client";
import type { Prisma } from "@/lib/generated/prisma/client";
import { can } from "@/lib/auth/permissions";
import { requireAccess } from "@/lib/os/guard";
import { getVisitorPolicy } from "@/lib/visitors/settings";
import { Kpi, KpiGrid, ListView, pageOf, pick, str, PAGE_SIZE, type SP } from "@/components/admin/os";
import { fmtDate } from "@/components/admin/ui";
import { CompanyCell, IntentBadge, TrackingOff, place } from "@/components/admin/visitors/ui";

export const metadata = { title: "Visitors" };

export default async function VisitorsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireAccess("visitors:view");
  const sp = await searchParams;
  const values = { q: str(sp, "q", 80), intent: pick(sp, "intent", ["HIGH", "MEDIUM", "LOW"] as const), country: str(sp, "country", 60), source: str(sp, "source", 80), company: pick(sp, "company", ["1", "0"] as const), lead: pick(sp, "lead", ["1", "0"] as const), returning: pick(sp, "returning", ["1"] as const), page: str(sp, "page") };
  const ci = { contains: values.q, mode: "insensitive" as const };
  const where: Prisma.VisitorWhereInput = {
    isBot: false,
    ...(values.q && { OR: [{ company: { name: ci } }, { company: { domain: ci } }, { city: ci }, { lastPage: ci }, { lead: { name: ci } }, { lead: { email: ci } }] }),
    ...(values.intent && { intentLabel: values.intent }),
    ...(values.country && { country: values.country }),
    ...(values.source && { OR: [{ firstSource: values.source }, { lastSource: values.source }] }),
    ...(values.company && { companyId: values.company === "1" ? { not: null } : null }),
    ...(values.lead && { leadId: values.lead === "1" ? { not: null } : null }),
    ...(values.returning && { sessionsCount: { gte: 2 } }),
  };
  const page = pageOf(sp);
  const dayAgo = new Date(Date.now() - 86_400_000);
  const weekAgo = new Date(Date.now() - 7 * 86_400_000);
  const [policy, total, rows, countries, sources, today, sessionsToday, high, identified, leads] = await Promise.all([
    getVisitorPolicy(),
    db.visitor.count({ where }),
    db.visitor.findMany({ where, orderBy: { lastSeenAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, include: { company: { select: { name: true, domain: true } }, lead: { select: { id: true, name: true } } } }),
    db.visitor.groupBy({ by: ["country"], where: { isBot: false, country: { not: null } }, _count: true, orderBy: { _count: { country: "desc" } }, take: 50 }),
    db.visitor.groupBy({ by: ["lastSource"], where: { isBot: false, lastSource: { not: null } }, _count: true, orderBy: { _count: { lastSource: "desc" } }, take: 30 }),
    db.visitor.count({ where: { isBot: false, lastSeenAt: { gte: dayAgo } } }),
    db.visitorSession.count({ where: { startedAt: { gte: dayAgo } } }),
    db.visitor.count({ where: { isBot: false, intentLabel: "HIGH", lastSeenAt: { gte: weekAgo } } }),
    db.visitor.count({ where: { isBot: false, companyId: { not: null }, lastSeenAt: { gte: weekAgo } } }),
    db.visitor.count({ where: { leadId: { not: null }, identifiedAt: { gte: weekAgo } } }),
  ]);
  return (
    <ListView
      title="Website visitors"
      description="First-party, consented website activity. Companies appear only when a provider returns a reliable match; people are identified only when they submit a form."
      crumbs={[{ label: "Website Intelligence" }, { label: "Visitors" }]}
      actions={
        <>
          <Link href="/admin/visitors/live" className="btn-secondary h-9 px-3 text-[13px]">Live</Link>
          <Link href="/admin/visitors/geo" className="btn-secondary h-9 px-3 text-[13px]">Geography</Link>
          <Link href="/admin/marketing/attribution" className="btn-secondary h-9 px-3 text-[13px]">Attribution</Link>
        </>
      }
      above={
        <>
          {!policy.enabled && <TrackingOff canManage={can(user.role, "visitors:manage")} />}
          <KpiGrid cols={5}>
            <Kpi label="Visitors (24h)" value={today} />
            <Kpi label="Sessions (24h)" value={sessionsToday} />
            <Kpi label="High intent (7d)" value={high} tone={high ? "amber" : undefined} href="/admin/visitors?intent=HIGH" />
            <Kpi label="Companies identified (7d)" value={identified} href="/admin/visitors?company=1" />
            <Kpi label="Became leads (7d)" value={leads} tone={leads ? "green" : undefined} href="/admin/visitors?lead=1" />
          </KpiGrid>
          <div className="h-4" />
        </>
      }
      filters={[
        { type: "search", name: "q", placeholder: "Company, city, page, lead…" },
        { type: "select", name: "intent", label: "Any intent", options: [["HIGH", "High"], ["MEDIUM", "Medium"], ["LOW", "Low"]] as const },
        { type: "select", name: "country", label: "Any country", options: countries.map((c) => [c.country!, `${c.country} (${c._count})`] as const) },
        { type: "select", name: "source", label: "Any source", options: sources.map((s) => [s.lastSource!, s.lastSource!] as const) },
        { type: "select", name: "company", label: "Company: any", options: [["1", "Identified"], ["0", "Not identified"]] as const },
        { type: "select", name: "lead", label: "Lead: any", options: [["1", "Linked to lead"], ["0", "Anonymous"]] as const },
        { type: "select", name: "returning", label: "New or returning", options: [["1", "Returning"]] as const },
      ]}
      values={values}
      rows={rows}
      total={total}
      page={page}
      basePath="/admin/visitors"
      empty={{ title: "No visitors recorded yet", description: policy.enabled ? "Visitors appear here after they accept cookies on the website." : "Turn on visitor tracking to start recording consented website activity." }}
      columns={[
        { header: "Visitor", cell: (v) => <Link href={`/admin/visitors/${v.id}`} className="font-medium hover:text-brand-blue">{v.lead?.name ?? `Visitor ${v.anonId.slice(0, 6)}`}</Link> },
        { header: "Company", cell: (v) => <CompanyCell company={v.company} /> },
        { header: "Location", cell: (v) => <span className="text-muted">{place(v)}</span> },
        { header: "Intent", cell: (v) => <IntentBadge label={v.intentLabel} score={v.intentScore} /> },
        { header: "Visits / pages", cell: (v) => `${v.sessionsCount} / ${v.pageViews}` },
        { header: "Source", cell: (v) => <span className="text-muted">{v.lastSource ? `${v.lastSource} / ${v.lastMedium}` : "—"}</span> },
        { header: "Last page", cell: (v) => <span className="text-muted">{v.lastPage ?? "—"}</span> },
        { header: "Last seen", cell: (v) => <span className="text-muted">{fmtDate(v.lastSeenAt, true)}</span> },
      ]}
    />
  );
}
