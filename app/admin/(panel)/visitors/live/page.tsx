import Link from "next/link";
import { db } from "@/lib/db/client";
import { can } from "@/lib/auth/permissions";
import { requireAccess } from "@/lib/os/guard";
import { getVisitorPolicy } from "@/lib/visitors/settings";
import { DataTable, Kpi, KpiGrid } from "@/components/admin/os";
import { PageHeader, fmtDate } from "@/components/admin/ui";
import { AutoRefresh } from "@/components/admin/ai/auto-refresh";
import { NoData } from "@/components/admin/workforce/ui";
import { CompanyCell, IntentBadge, TrackingOff, place } from "@/components/admin/visitors/ui";

export const metadata = { title: "Live visitors" };

export default async function LiveVisitorsPage() {
  const user = await requireAccess("visitors:view");
  const policy = await getVisitorPolicy();
  const since = new Date(new Date().getTime() - policy.liveWindowMinutes * 60_000);
  const sessions = await db.visitorSession.findMany({ where: { lastSeenAt: { gte: since }, visitor: { isBot: false } }, orderBy: { lastSeenAt: "desc" }, take: 200, include: { visitor: { include: { company: { select: { name: true, domain: true } }, lead: { select: { id: true, name: true } } } } } });
  const high = sessions.filter((s) => s.visitor.intentLabel === "HIGH").length;
  return (
    <>
      <AutoRefresh active every={15_000} />
      <PageHeader title="Live visitors" description={`Sessions active in the last ${policy.liveWindowMinutes} minutes. Refreshes every 15 seconds.`} crumbs={[{ label: "Visitors", href: "/admin/visitors" }, { label: "Live" }]} />
      {!policy.enabled && <TrackingOff canManage={can(user.role, "visitors:manage")} />}
      <KpiGrid cols={3}>
        <Kpi label="On the site now" value={sessions.length} />
        <Kpi label="High intent now" value={high} tone={high ? "amber" : undefined} />
        <Kpi label="Known leads now" value={sessions.filter((s) => s.visitor.leadId).length} />
      </KpiGrid>
      <div className="h-4" />
      {sessions.length ? (
        <DataTable
          rows={sessions}
          columns={[
            { header: "Visitor", cell: (s) => <Link href={`/admin/visitors/${s.visitor.id}`} className="font-medium hover:text-brand-blue">{s.visitor.lead?.name ?? `Visitor ${s.visitor.anonId.slice(0, 6)}`}</Link> },
            { header: "Company", cell: (s) => <CompanyCell company={s.visitor.company} /> },
            { header: "Location", cell: (s) => place(s) },
            { header: "Current page", cell: (s) => <span className="text-muted">{s.currentPage ?? s.landingPage ?? "—"}</span> },
            { header: "Source", cell: (s) => `${s.source ?? "direct"} / ${s.medium ?? "none"}` },
            { header: "Pages", cell: (s) => s.pageViews },
            { header: "Intent", cell: (s) => <IntentBadge label={s.visitor.intentLabel} score={s.visitor.intentScore} /> },
            { header: "Device", cell: (s) => <span className="text-muted">{[s.device, s.browser].filter(Boolean).join(" · ") || "—"}</span> },
            { header: "Last activity", cell: (s) => fmtDate(s.lastSeenAt, true) },
          ]}
        />
      ) : (
        <NoData>Nobody is on the website right now{policy.enabled ? "" : " (tracking is off)"}.</NoData>
      )}
    </>
  );
}
