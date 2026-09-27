import Link from "next/link";
import { db } from "@/lib/db/client";
import { requirePermission } from "@/lib/auth/session";
import { setFollowUpStatusAction } from "@/lib/admin/lead-actions";
import { Badge, EmptyState, PageHeader, Panel, fmtDate } from "@/components/admin/ui";
import { SubmitButton } from "@/components/admin/client";
import { cn } from "@/lib/cn";

export const metadata = { title: "Follow-ups" };

export default async function FollowUpsPage({ searchParams }: { searchParams: Promise<{ mine?: string }> }) {
  const user = await requirePermission("followups:manage");
  const { mine } = await searchParams;
  const now = new Date();
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dayEnd = new Date(dayStart.getTime() + 86400000);
  const base = { status: "PENDING" as const, ...(mine === "1" && { assignedToId: user.id }) };
  const include = { lead: { select: { id: true, name: true, company: true, status: true } }, assignedTo: { select: { name: true } } };
  const [overdue, today, upcoming] = await Promise.all([
    db.followUp.findMany({ where: { ...base, dueAt: { lt: now } }, orderBy: { dueAt: "asc" }, take: 100, include }),
    db.followUp.findMany({ where: { ...base, dueAt: { gte: now, lt: dayEnd } }, orderBy: { dueAt: "asc" }, take: 100, include }),
    db.followUp.findMany({ where: { ...base, dueAt: { gte: dayEnd } }, orderBy: { dueAt: "asc" }, take: 100, include }),
  ]);

  const list = (items: typeof overdue, tone: "red" | "amber" | "blue") =>
    items.length === 0 ? (
      <p className="py-4 text-center text-sm text-dim">Nothing here.</p>
    ) : (
      <ul className="divide-y divide-line">
        {items.map((f) => (
          <li key={f.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <Link href={`/admin/leads/${f.lead.id}`} className="font-medium text-fg hover:text-brand-blue">
                {f.lead.name}
              </Link>
              {f.lead.company && <span className="text-sm text-dim"> · {f.lead.company}</span>}
              {f.note && <p className="truncate text-sm text-muted">{f.note}</p>}
              <p className="text-xs text-dim">
                <Badge tone={tone}>{fmtDate(f.dueAt, true)}</Badge> <span className="ml-1">{f.assignedTo?.name ?? "Unassigned"}</span>
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <form action={setFollowUpStatusAction.bind(null, f.id, "DONE")}>
                <SubmitButton variant="secondary" className="h-8 px-2.5 text-xs">Mark done</SubmitButton>
              </form>
              <form action={setFollowUpStatusAction.bind(null, f.id, "CANCELLED")}>
                <SubmitButton variant="secondary" className="h-8 px-2.5 text-xs">Cancel</SubmitButton>
              </form>
            </div>
          </li>
        ))}
      </ul>
    );

  const tab = (href: string, text: string, active: boolean) => (
    <Link href={href} className={cn("rounded-md px-3 py-1.5 text-[13px]", active ? "bg-ink-800 font-medium text-fg" : "text-muted hover:text-fg")}>
      {text}
    </Link>
  );

  return (
    <>
      <PageHeader title="Follow-ups" description="Scheduled sales follow-ups across all leads (times in UTC)." crumbs={[{ label: "Follow-ups" }]} actions={<div className="flex gap-1">{tab("/admin/follow-ups", "Everyone", mine !== "1")}{tab("/admin/follow-ups?mine=1", "Mine", mine === "1")}</div>} />
      {overdue.length + today.length + upcoming.length === 0 ? (
        <div className="rounded-lg border border-line bg-ink-900">
          <EmptyState title="No pending follow-ups" description="Schedule a follow-up from any lead's detail page." action={<Link href="/admin/leads" className="btn-secondary h-9 px-3 text-[13px]">Open leads</Link>} />
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-3">
          <Panel title={`Overdue (${overdue.length})`}>{list(overdue, "red")}</Panel>
          <Panel title={`Today (${today.length})`}>{list(today, "amber")}</Panel>
          <Panel title={`Upcoming (${upcoming.length})`}>{list(upcoming, "blue")}</Panel>
        </div>
      )}
    </>
  );
}
