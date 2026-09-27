import { db } from "@/lib/db/client";
import { ROLE_LABELS, type RoleName } from "@/lib/auth/permissions";
import { requireAccess } from "@/lib/os/guard";
import { byCurrency, fmtMulti } from "@/lib/os/money";
import { resolveRange } from "@/lib/os/range";
import { PageHeader } from "@/components/admin/ui";
import { RangePicker } from "@/components/admin/range";
import { DataTable, str, type SP } from "@/components/admin/os";

export const metadata = { title: "Team performance" };

type Row = { id: string; name: string; role: string; leads: number; contacted: number; followDone: number; followOverdue: number; won: number; wonValue: string; tasksDone: number; tickets: number; frt: string };

/** Activity and outcomes per team member from real records (no scoring or ranking is invented). */
export default async function PerformancePage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAccess("performance:view");
  const sp = await searchParams;
  const range = resolveRange(str(sp, "range", 10) || "30d", str(sp, "from", 10), str(sp, "to", 10));
  const w = range.from || range.to ? { gte: range.from, lte: range.to } : undefined;
  const now = new Date();
  const users = await db.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, role: true } });
  const [leads, contacted, followDone, followOverdue, won, tasks, tickets] = await Promise.all([
    db.lead.groupBy({ by: ["assignedToId"], where: { archivedAt: null, createdAt: w, assignedToId: { not: null } }, _count: true }),
    db.leadActivity.groupBy({ by: ["actorId"], where: { type: "CONTACTED", createdAt: w, actorId: { not: null } }, _count: true }),
    db.followUp.groupBy({ by: ["assignedToId"], where: { status: "DONE", completedAt: w, assignedToId: { not: null } }, _count: true }),
    db.followUp.groupBy({ by: ["assignedToId"], where: { status: "PENDING", dueAt: { lt: now }, assignedToId: { not: null } }, _count: true }),
    db.deal.findMany({ where: { deletedAt: null, stage: "WON", wonAt: w, ownerId: { not: null } }, select: { ownerId: true, value: true, currency: true } }),
    db.task.groupBy({ by: ["assigneeId"], where: { status: "DONE", completedAt: w, assigneeId: { not: null } }, _count: true }),
    db.ticket.findMany({ where: { resolvedAt: w, assigneeId: { not: null } }, select: { assigneeId: true, createdAt: true, firstResponseAt: true } }),
  ]);
  const counts = <K extends string>(list: ({ _count: number } & Record<K, string | null>)[], key: K) => new Map(list.map((x) => [x[key], x._count]));
  const [cLeads, cContacted, cDone, cOverdue, cTasks] = [counts(leads, "assignedToId"), counts(contacted, "actorId"), counts(followDone, "assignedToId"), counts(followOverdue, "assignedToId"), counts(tasks, "assigneeId")];
  const rows: Row[] = users.map((u) => {
    const mine = won.filter((d) => d.ownerId === u.id);
    const t = tickets.filter((x) => x.assigneeId === u.id);
    const f = t.filter((x) => x.firstResponseAt).map((x) => (x.firstResponseAt!.getTime() - x.createdAt.getTime()) / 3600_000);
    return {
      id: u.id,
      name: u.name,
      role: ROLE_LABELS[u.role as RoleName],
      leads: cLeads.get(u.id) ?? 0,
      contacted: cContacted.get(u.id) ?? 0,
      followDone: cDone.get(u.id) ?? 0,
      followOverdue: cOverdue.get(u.id) ?? 0,
      won: mine.length,
      wonValue: mine.length ? fmtMulti(byCurrency(mine, (d) => d.currency, (d) => d.value), true) : "—",
      tasksDone: cTasks.get(u.id) ?? 0,
      tickets: t.length,
      frt: f.length ? `${(f.reduce((a, b) => a + b, 0) / f.length).toFixed(1)} h` : "—",
    };
  });
  const active = rows.filter((r) => r.leads || r.contacted || r.followDone || r.followOverdue || r.won || r.tasksDone || r.tickets);
  return (
    <>
      <PageHeader title="Team performance" description="Activity and outcomes per person from real records. Overdue follow-ups are shown as of today; everything else for the selected period." crumbs={[{ label: "Reports", href: "/admin/reports" }, { label: "Performance" }]} />
      <RangePicker active={range.key} basePath="/admin/performance" from={str(sp, "from", 10)} to={str(sp, "to", 10)} />
      {active.length === 0 ? <p className="text-sm text-muted">No recorded activity for this period.</p> : (
        <DataTable rows={active} columns={[
          { header: "Person", cell: (r) => <span>{r.name}<span className="block text-xs text-dim">{r.role}</span></span> },
          { header: "Leads assigned", cell: (r) => r.leads },
          { header: "Contacted", cell: (r) => r.contacted },
          { header: "Follow-ups done", cell: (r) => r.followDone },
          { header: "Overdue now", cell: (r) => <span className={r.followOverdue ? "text-red-700" : ""}>{r.followOverdue}</span> },
          { header: "Deals won", cell: (r) => <span>{r.won}<span className="block text-xs text-dim">{r.wonValue}</span></span> },
          { header: "Tasks done", cell: (r) => r.tasksDone },
          { header: "Tickets resolved", cell: (r) => <span>{r.tickets}<span className="block text-xs text-dim">FRT {r.frt}</span></span> },
        ]} />
      )}
    </>
  );
}
