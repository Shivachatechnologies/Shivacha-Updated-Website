import { db } from "@/lib/db/client";
import type { Prisma } from "@/lib/generated/prisma/client";
import { requireAccess } from "@/lib/os/guard";
import { ListView, LinkCell, pageOf, str, PAGE_SIZE, type SP } from "@/components/admin/os";
import { fmtDate, label } from "@/components/admin/ui";

export const metadata = { title: "CRM activities" };

const TYPES = ["CREATED", "UPDATED", "STATUS_CHANGED", "PRIORITY_CHANGED", "ASSIGNED", "NOTE_ADDED", "CONTACTED", "FOLLOWUP_SCHEDULED", "FOLLOWUP_DONE", "CONVERTED_TO_DEAL", "MERGED", "EMAIL_SENT", "CALL_LOGGED"];

export default async function ActivitiesPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAccess("leads:view", "ADVANCED_CRM");
  const sp = await searchParams;
  const values = { type: str(sp, "type", 40), actor: str(sp, "actor", 40), page: str(sp, "page") };
  const page = pageOf(sp);
  const where: Prisma.LeadActivityWhereInput = { ...(values.type && { type: values.type }), ...(values.actor === "system" ? { actorId: null } : values.actor ? { actorId: values.actor } : {}) };
  const [total, rows, users] = await Promise.all([
    db.leadActivity.count({ where }),
    db.leadActivity.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, include: { lead: { select: { id: true, name: true, company: true } }, actor: { select: { name: true } } } }),
    db.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const detail = (d: unknown) => {
    const o = (d ?? {}) as Record<string, unknown>;
    if (o.from && o.to) return `${label(String(o.from))} → ${label(String(o.to))}`;
    if (o.channel) return `via ${o.channel}`;
    if (o.number) return String(o.number);
    return "";
  };
  return (
    <ListView
      title="CRM activities"
      description="Every change, contact and follow-up across all leads."
      crumbs={[{ label: "CRM" }, { label: "Activities" }]}
      values={values}
      filters={[
        { type: "select", name: "type", label: "All activity", options: TYPES.map((t) => [t, label(t)] as const) },
        { type: "select", name: "actor", label: "Anyone", options: [["system", "System / website"], ...users.map((u) => [u.id, u.name] as const)] },
      ]}
      rows={rows}
      total={total}
      page={page}
      basePath="/admin/crm/activities"
      empty={{ title: "No activity yet", description: "Lead activity from the website and your team appears here." }}
      columns={[
        { header: "When", cell: (a) => <span className="whitespace-nowrap text-muted">{fmtDate(a.createdAt, true)}</span> },
        { header: "Lead", cell: (a) => <LinkCell href={`/admin/leads/${a.lead.id}`} sub={a.lead.company}>{a.lead.name}</LinkCell> },
        { header: "Activity", cell: (a) => <span className="text-fg">{label(a.type)} <span className="text-muted">{detail(a.data)}</span></span> },
        { header: "By", cell: (a) => <span className="text-muted">{a.actor?.name ?? "System"}</span> },
      ]}
    />
  );
}
