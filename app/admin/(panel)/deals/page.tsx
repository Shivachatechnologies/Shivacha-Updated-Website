import Link from "next/link";
import { db } from "@/lib/db/client";
import type { Prisma } from "@/lib/generated/prisma/client";
import { can } from "@/lib/auth/permissions";
import { requireAccess } from "@/lib/os/guard";
import { fmtMoney } from "@/lib/os/money";
import { resolveRange } from "@/lib/os/range";
import { DEAL_STAGES, OPEN_DEAL_STAGES } from "@/lib/crm/constants";
import { dealMetrics } from "@/lib/sales/deals";
import { moveDealStageAction } from "@/lib/sales/deal-actions";
import { CURRENCIES } from "@/lib/os/money";
import { Kanban } from "@/components/admin/kanban";
import { DealMetrics } from "@/components/admin/sales/metrics";
import { RangePicker } from "@/components/admin/range";
import { FilterBar, LinkCell, ListView, StatusBadge, Tabs, pageOf, pick, str, PAGE_SIZE, type SP } from "@/components/admin/os";
import { PageHeader, fmtDate, label } from "@/components/admin/ui";

export const metadata = { title: "Deals" };

export default async function DealsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireAccess("deals:view", "SALES_PIPELINE");
  const sp = await searchParams;
  const view = str(sp, "view") === "board" ? "board" : "table";
  const values = { q: str(sp, "q", 80), stage: pick(sp, "stage", DEAL_STAGES), owner: str(sp, "owner", 40), currency: pick(sp, "currency", CURRENCIES), view: view === "board" ? "board" : undefined, range: str(sp, "range", 10) || undefined, from: str(sp, "from", 10) || undefined, to: str(sp, "to", 10) || undefined, page: str(sp, "page") };
  const range = resolveRange(values.range, values.from, values.to);
  const where: Prisma.DealWhereInput = {
    deletedAt: null,
    ...(values.q && { OR: [{ name: { contains: values.q, mode: "insensitive" } }, { company: { contains: values.q, mode: "insensitive" } }, { number: { contains: values.q, mode: "insensitive" } }] }),
    ...(values.stage && { stage: values.stage }),
    ...(values.currency && { currency: values.currency }),
    ...(values.owner === "me" ? { ownerId: user.id } : values.owner ? { ownerId: values.owner } : {}),
  };
  const page = pageOf(sp);
  const users = await db.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  const metrics = await dealMetrics({ from: range.from, to: range.to }, values.owner === "me" ? user.id : values.owner || undefined);
  const canManage = can(user.role, "deals:manage");
  const actions = (
    <>
      {canManage && <Link href="/admin/deals/new" className="btn-primary h-9 px-3.5 text-[13px]">New deal</Link>}
    </>
  );
  const tabs = (
    <Tabs
      active={view}
      items={[
        { key: "table", label: "Table", href: `/admin/deals?${new URLSearchParams({ ...(values.q && { q: values.q }), ...(values.owner && { owner: values.owner }) })}` },
        { key: "board", label: "Board", href: `/admin/deals?${new URLSearchParams({ view: "board", ...(values.q && { q: values.q }), ...(values.owner && { owner: values.owner }) })}` },
      ]}
    />
  );
  const extra = Object.fromEntries(Object.entries({ view: values.view, owner: values.owner }).filter(([, v]) => v)) as Record<string, string>;
  const above = (
    <>
      <RangePicker active={range.key} basePath="/admin/deals" extra={extra} from={values.from} to={values.to} />
      <div className="mb-5"><DealMetrics m={metrics} /></div>
    </>
  );
  const filters = [
    { type: "search" as const, name: "q", placeholder: "Search deal, company, number…" },
    ...(view === "table" ? [{ type: "select" as const, name: "stage", label: "All stages", options: DEAL_STAGES.map((s) => [s, label(s)] as const) }] : []),
    { type: "select" as const, name: "owner", label: "Any owner", options: [["me", "My deals"] as const, ...users.map((u) => [u.id, u.name] as const)] },
    { type: "select" as const, name: "currency", label: "Any currency", options: CURRENCIES.map((c) => [c, c] as const) },
  ];

  if (view === "board") {
    const [groups, ...cols] = await Promise.all([
      db.deal.groupBy({ by: ["stage", "currency"], where: { ...where, stage: { in: [...OPEN_DEAL_STAGES] } }, _count: { _all: true }, _sum: { value: true } }),
      ...OPEN_DEAL_STAGES.map((s) => db.deal.findMany({ where: { ...where, stage: s }, orderBy: [{ value: "desc" }], take: 40, select: { id: true, number: true, name: true, company: true, value: true, currency: true, probability: true, expectedCloseDate: true, owner: { select: { name: true } } } })),
    ]);
    const now = new Date();
    return (
      <>
        <PageHeader title="Deals" description="Open pipeline by stage. Mark deals won or lost from the deal page." crumbs={[{ label: "Sales" }, { label: "Deals" }]} actions={actions} />
        {tabs}
        {above}
        <FilterBar filters={filters} values={values} hidden={{ view: "board" }} />
        <Kanban
          columns={OPEN_DEAL_STAGES.map((s) => {
            const g = groups.filter((x) => x.stage === s);
            const top = [...g].sort((a, b) => Number(b._sum.value ?? 0) - Number(a._sum.value ?? 0))[0];
            return { key: s, label: label(s), count: g.reduce((n, x) => n + x._count._all, 0), total: top?._sum.value ? `${fmtMoney(top._sum.value, top.currency, { compact: true })}${g.length > 1 ? " +" : ""}` : undefined };
          })}
          cards={cols.flatMap((rows, i) => rows.map((d) => ({ id: d.id, column: OPEN_DEAL_STAGES[i], title: d.name, href: `/admin/deals/${d.id}`, sub: [d.number, d.company].filter(Boolean).join(" · "), meta: `${d.owner?.name ?? "No owner"} · ${d.probability}%`, badge: fmtMoney(d.value, d.currency, { compact: true }), tone: d.expectedCloseDate && d.expectedCloseDate < now ? ("red" as const) : undefined })))}
          move={canManage ? moveDealStageAction : undefined}
          readOnly={!canManage}
        />
      </>
    );
  }

  const [total, rows] = await Promise.all([
    db.deal.count({ where }),
    db.deal.findMany({ where, orderBy: [{ updatedAt: "desc" }], skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, include: { owner: { select: { name: true } }, client: { select: { name: true } } } }),
  ]);
  return (
    <ListView
      title="Deals"
      description="Every opportunity from qualification to close."
      crumbs={[{ label: "Sales" }, { label: "Deals" }]}
      actions={actions}
      tabs={tabs}
      above={above}
      filters={filters}
      values={values}
      rows={rows}
      total={total}
      page={page}
      basePath="/admin/deals"
      empty={{ title: "No deals yet", description: "Convert a qualified lead into a deal, or create one directly.", action: canManage ? <Link href="/admin/deals/new" className="btn-secondary h-9 px-3 text-[13px]">Create a deal</Link> : undefined }}
      columns={[
        { header: "Deal", cell: (d) => <LinkCell href={`/admin/deals/${d.id}`} sub={[d.number, d.client?.name ?? d.company].filter(Boolean).join(" · ")}>{d.name}</LinkCell> },
        { header: "Stage", cell: (d) => <StatusBadge value={d.stage} /> },
        { header: "Value", cell: (d) => <span className="whitespace-nowrap tabular-nums">{fmtMoney(d.value, d.currency)}</span>, className: "text-right" },
        { header: "Prob.", cell: (d) => <span className="text-muted tabular-nums">{d.probability}%</span> },
        { header: "Close", cell: (d) => <span className="whitespace-nowrap text-muted">{fmtDate(d.stage === "WON" ? d.wonAt : d.stage === "LOST" ? d.lostAt : d.expectedCloseDate)}</span> },
        { header: "Owner", cell: (d) => <span className="whitespace-nowrap text-muted">{d.owner?.name ?? "—"}</span> },
        { header: "Country", cell: (d) => <span className="text-muted">{d.country ?? "—"}</span> },
      ]}
    />
  );
}
