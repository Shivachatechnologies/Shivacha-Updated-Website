import Link from "next/link";
import { db } from "@/lib/db/client";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { Badge, EmptyState, LEAD_STATUS_TONE, PageHeader, Panel, Stat, TableWrap, fmtDate, label, td, th } from "@/components/admin/ui";
import { BarList, ColumnChart } from "@/components/admin/charts";

export const metadata = { title: "Dashboard" };

const STATUSES = ["NEW", "CONTACTED", "QUALIFIED", "PROPOSAL_SENT", "NEGOTIATION", "WON", "LOST", "ON_HOLD"] as const;

async function breakdown(field: "country" | "service" | "product" | "source") {
  const rows = await db.lead.groupBy({ by: [field], where: { archivedAt: null, [field]: { not: null } }, _count: { _all: true }, orderBy: { _count: { [field]: "desc" } }, take: 8 });
  return rows.map((r) => ({ label: String(r[field] ?? "—"), value: r._count._all }));
}

export default async function Dashboard() {
  const user = await requirePermission("dashboard:view");
  const seeLeads = can(user.role, "leads:view");
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const [statusRows, total, thisMonth, pubServices, pubProducts, pubPosts, weekly, byCountry, byService, byProduct, bySource, recent, activity, overdue] = await Promise.all([
    seeLeads ? db.lead.groupBy({ by: ["status"], where: { archivedAt: null }, _count: { _all: true } }) : Promise.resolve([]),
    seeLeads ? db.lead.count({ where: { archivedAt: null } }) : Promise.resolve(0),
    seeLeads ? db.lead.count({ where: { archivedAt: null, createdAt: { gte: monthStart } } }) : Promise.resolve(0),
    db.service.count({ where: { status: "PUBLISHED" } }),
    db.product.count({ where: { status: "PUBLISHED" } }),
    db.blogPost.count({ where: { status: "PUBLISHED" } }),
    seeLeads
      ? db.$queryRaw<{ week: Date; n: bigint }[]>`SELECT date_trunc('week', "createdAt") AS week, count(*)::bigint AS n FROM "Lead" WHERE "archivedAt" IS NULL AND "createdAt" >= now() - interval '12 weeks' GROUP BY 1 ORDER BY 1`
      : Promise.resolve([]),
    seeLeads ? breakdown("country") : Promise.resolve([]),
    seeLeads ? breakdown("service") : Promise.resolve([]),
    seeLeads ? breakdown("product") : Promise.resolve([]),
    seeLeads ? breakdown("source") : Promise.resolve([]),
    seeLeads ? db.lead.findMany({ where: { archivedAt: null }, orderBy: { createdAt: "desc" }, take: 8, select: { id: true, name: true, company: true, country: true, service: true, product: true, budget: true, status: true, createdAt: true } }) : Promise.resolve([]),
    can(user.role, "audit:view") ? db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 10, include: { user: { select: { name: true } } } }) : Promise.resolve([]),
    can(user.role, "followups:manage") ? db.followUp.findMany({ where: { status: "PENDING", dueAt: { lt: now } }, orderBy: { dueAt: "asc" }, take: 6, include: { lead: { select: { id: true, name: true } } } }) : Promise.resolve([]),
  ]);

  const counts = Object.fromEntries(STATUSES.map((s) => [s, statusRows.find((r) => r.status === s)?._count._all ?? 0])) as Record<(typeof STATUSES)[number], number>;
  const conversion = total ? Math.round((counts.WON / total) * 1000) / 10 : 0;

  // 12 weekly buckets, including empty weeks.
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7) - 7 * 11);
  const weeks = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(start.getTime() + i * 7 * 86400000);
    const hit = weekly.find((w) => new Date(w.week).toISOString().slice(0, 10) === d.toISOString().slice(0, 10));
    return { label: d.toISOString().slice(5, 10), value: hit ? Number(hit.n) : 0 };
  });

  return (
    <>
      <PageHeader title={`Welcome, ${user.name.split(" ")[0]}`} description="Live figures from the CRM and CMS." />

      {seeLeads && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
            <Stat label="Total leads" value={total.toLocaleString()} href="/admin/leads" />
            <Stat label="New" value={counts.NEW} href="/admin/leads?status=NEW" />
            <Stat label="Leads this month" value={thisMonth} />
            <Stat label="Conversion rate" value={`${conversion}%`} hint="Won ÷ all leads" />
            <Stat label="Won" value={counts.WON} href="/admin/leads?status=WON" />
            <Stat label="Lost" value={counts.LOST} href="/admin/leads?status=LOST" />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Contacted" value={counts.CONTACTED} href="/admin/leads?status=CONTACTED" />
            <Stat label="Qualified" value={counts.QUALIFIED} href="/admin/leads?status=QUALIFIED" />
            <Stat label="Proposal sent" value={counts.PROPOSAL_SENT} href="/admin/leads?status=PROPOSAL_SENT" />
            <Stat label="Negotiation" value={counts.NEGOTIATION} href="/admin/leads?status=NEGOTIATION" />
          </div>
        </>
      )}

      <div className="mt-3 grid grid-cols-3 gap-3">
        <Stat label="Published services" value={pubServices} href={can(user.role, "services:manage") ? "/admin/services?status=PUBLISHED" : undefined} />
        <Stat label="Published products" value={pubProducts} href={can(user.role, "products:manage") ? "/admin/products?status=PUBLISHED" : undefined} />
        <Stat label="Published posts" value={pubPosts} href={can(user.role, "blog:manage") ? "/admin/blog?status=PUBLISHED" : undefined} />
      </div>

      {overdue.length > 0 && (
        <Panel title={`Overdue follow-ups (${overdue.length})`} className="mt-6 border-amber-500/40" action={<Link href="/admin/follow-ups?view=overdue" className="text-xs font-medium text-brand-blue hover:underline">View all</Link>}>
          <ul className="divide-y divide-line text-sm">
            {overdue.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-3 py-2">
                <Link href={`/admin/leads/${f.lead.id}`} className="truncate font-medium text-fg hover:underline">{f.lead.name}</Link>
                <span className="shrink-0 text-xs text-amber-700">Due {fmtDate(f.dueAt, true)}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {seeLeads && (
        <>
          <div className="mt-6 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
            <Panel title="Leads per week (last 12 weeks)">
              <ColumnChart data={weeks} label="Leads per week" />
            </Panel>
            <Panel title="Leads by status">
              <BarList data={STATUSES.map((s) => ({ label: label(s), value: counts[s] })).filter((d) => d.value)} empty="No leads yet" />
            </Panel>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Panel title="By country"><BarList data={byCountry} /></Panel>
            <Panel title="By service"><BarList data={byService} /></Panel>
            <Panel title="By product"><BarList data={byProduct} /></Panel>
            <Panel title="By source"><BarList data={bySource} /></Panel>
          </div>
          <h2 className="mt-8 mb-3 text-sm font-semibold text-fg">Recent leads</h2>
          {recent.length ? (
            <TableWrap>
              <thead>
                <tr>
                  {["Name", "Company", "Country", "Service", "Product", "Budget", "Status", "Date"].map((h) => (
                    <th key={h} className={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recent.map((l) => (
                  <tr key={l.id} className="hover:bg-ink-850">
                    <td className={td}><Link href={`/admin/leads/${l.id}`} className="font-medium hover:underline">{l.name}</Link></td>
                    <td className={td}>{l.company ?? "—"}</td>
                    <td className={td}>{l.country ?? "—"}</td>
                    <td className={td}>{l.service ?? "—"}</td>
                    <td className={td}>{l.product ?? "—"}</td>
                    <td className={td}>{l.budget ?? "—"}</td>
                    <td className={td}><Badge tone={LEAD_STATUS_TONE[l.status]}>{label(l.status)}</Badge></td>
                    <td className={`${td} whitespace-nowrap text-muted`}>{fmtDate(l.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          ) : (
            <Panel><EmptyState title="No leads yet" description="Leads from the website's inquiry forms appear here automatically." /></Panel>
          )}
        </>
      )}

      {activity.length > 0 && (
        <Panel title="Recent admin activity" className="mt-8" action={<Link href="/admin/audit-logs" className="text-xs font-medium text-brand-blue hover:underline">Audit log</Link>}>
          <ul className="divide-y divide-line text-sm">
            {activity.map((a) => (
              <li key={a.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2">
                <span><span className="font-medium text-fg">{a.user?.name ?? "System"}</span> <span className="text-muted">{a.action.replace(/[._]/g, " ")}</span>{a.entity && <span className="text-dim"> · {a.entity}</span>}</span>
                <span className="text-xs text-dim">{fmtDate(a.createdAt, true)}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </>
  );
}
