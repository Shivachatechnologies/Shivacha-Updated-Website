import Link from "next/link";
import { db } from "@/lib/db/client";
import type { Prisma } from "@/lib/generated/prisma/client";
import { can } from "@/lib/auth/permissions";
import { requireAccess } from "@/lib/os/guard";
import { fmtMoney } from "@/lib/os/money";
import { LinkCell, ListView, StatusBadge, pageOf, pick, str, PAGE_SIZE, type SP } from "@/components/admin/os";
import { fmtDate, label } from "@/components/admin/ui";

export const metadata = { title: "Campaigns" };
const STATUSES = ["PLANNED", "ACTIVE", "PAUSED", "COMPLETED"] as const;

export default async function CampaignsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireAccess("marketing:view", "MARKETING_ANALYTICS");
  const sp = await searchParams;
  const values = { q: str(sp, "q", 80), status: pick(sp, "status", STATUSES), page: str(sp, "page") };
  const where: Prisma.CampaignWhereInput = { ...(values.status && { status: values.status }), ...(values.q && { OR: [{ name: { contains: values.q, mode: "insensitive" } }, { utmCampaign: { contains: values.q.toLowerCase() } }] }) };
  const page = pageOf(sp);
  const [total, rows] = await Promise.all([db.campaign.count({ where }), db.campaign.findMany({ where, orderBy: { updatedAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE })]);
  const utms = rows.map((r) => r.utmCampaign).filter((x): x is string => !!x);
  const [leadCounts, spend] = await Promise.all([
    utms.length ? db.lead.groupBy({ by: ["utmCampaign"], where: { utmCampaign: { in: utms }, archivedAt: null }, _count: { _all: true } }) : Promise.resolve([]),
    db.campaignMetric.groupBy({ by: ["campaignId"], where: { campaignId: { in: rows.map((r) => r.id) } }, _sum: { spend: true } }),
  ]);
  return (
    <ListView
      title="Campaigns"
      description="Link a campaign to its utm_campaign value to attribute leads, won deals and ROI."
      crumbs={[{ label: "Marketing", href: "/admin/marketing" }, { label: "Campaigns" }]}
      actions={can(user.role, "marketing:manage") && <Link href="/admin/marketing/campaigns/new" className="btn-primary h-9 px-3.5 text-[13px]">New campaign</Link>}
      values={values}
      filters={[{ type: "search", name: "q", placeholder: "Search name or utm_campaign…" }, { type: "select", name: "status", label: "Any status", options: STATUSES.map((s) => [s, label(s)] as const) }]}
      rows={rows}
      total={total}
      page={page}
      basePath="/admin/marketing/campaigns"
      empty={{ title: "No campaigns yet" }}
      columns={[
        { header: "Campaign", cell: (c) => <LinkCell href={`/admin/marketing/campaigns/${c.id}`} sub={c.utmCampaign ? `utm_campaign=${c.utmCampaign}` : "No UTM link"}>{c.name}</LinkCell> },
        { header: "Channel", cell: (c) => <span className="text-muted">{label(c.channel)}</span> },
        { header: "Status", cell: (c) => <StatusBadge value={c.status} /> },
        { header: "Leads", cell: (c) => <span className="tabular-nums">{leadCounts.find((l) => l.utmCampaign === c.utmCampaign)?._count._all ?? 0}</span> },
        { header: "Spend", cell: (c) => { const s = spend.find((x) => x.campaignId === c.id)?._sum.spend; return <span className="tabular-nums text-muted">{s ? fmtMoney(s, c.currency) : "—"}</span>; } },
        { header: "Budget", cell: (c) => <span className="tabular-nums text-muted">{c.budget ? fmtMoney(c.budget, c.currency) : "—"}</span> },
        { header: "Dates", cell: (c) => <span className="whitespace-nowrap text-muted">{fmtDate(c.startDate)} → {fmtDate(c.endDate)}</span> },
      ]}
    />
  );
}
