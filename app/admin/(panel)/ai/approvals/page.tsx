import { db } from "@/lib/db/client";
import type { Prisma } from "@/lib/generated/prisma/client";
import { can } from "@/lib/auth/permissions";
import { requireAccess } from "@/lib/os/guard";
import { canDecide } from "@/lib/ai/approvals";
import { agentBySlug } from "@/lib/ai/catalog";
import { PageHeader, fmtDate } from "@/components/admin/ui";
import { DataTable, LinkCell, StatusBadge, Tabs, pageOf, pick, type SP } from "@/components/admin/os";
import { WorkforceNav } from "@/components/admin/ai/workforce";

export const metadata = { title: "Human Approval Center" };

const TABS = ["pending", "history"] as const;

export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireAccess("ai:view", "AI_WORKFORCE");
  const sp = await searchParams;
  const tab = pick(sp, "tab", TABS) ?? "pending";
  const page = pageOf(sp);
  const where: Prisma.AIApprovalWhereInput = tab === "pending" ? { status: "PENDING" } : { status: { not: "PENDING" } };
  const rows = await db.aIApproval.findMany({ where, orderBy: { createdAt: "desc" }, take: 200, skip: (page - 1) * 200, include: { requestedBy: { select: { name: true } }, decidedBy: { select: { name: true } } } });
  // Everyone sees what they can decide or requested; configurators see everything.
  const visible = rows.filter((a) => can(user.role, "ai:configure") || a.requestedById === user.id || canDecide(user, a.requiredPermission));
  const pendingCount = await db.aIApproval.count({ where: { status: "PENDING" } });
  return (
    <>
      <PageHeader title="Human Approval Center" description="Nothing an agent or automation proposes that changes data or contacts a customer runs until a person with the right permission approves it. Approve, reject, or edit and approve." crumbs={[{ label: "AI", href: "/admin/ai/command-center" }, { label: "Approvals" }]} />
      <WorkforceNav active="approvals" counts={{ approvals: pendingCount }} />
      <Tabs active={tab} items={[{ key: "pending", label: "Pending", href: "/admin/ai/approvals", count: pendingCount }, { key: "history", label: "History", href: "/admin/ai/approvals?tab=history" }]} />
      {visible.length === 0 ? <p className="text-sm text-muted">{tab === "pending" ? "No approvals waiting for you." : "No decisions yet."}</p> : (
        <DataTable rows={visible} columns={[
          { header: "Action", cell: (a) => <LinkCell href={`/admin/ai/approvals/${a.id}`} sub={a.reason ?? undefined}>{a.action}</LinkCell> },
          { header: "AI employee", cell: (a) => <span className="text-muted">{a.agentSlug === "automation" ? "Automation" : agentBySlug(a.agentSlug)?.name ?? a.agentSlug}{a.requestedBy ? ` · for ${a.requestedBy.name}` : ""}</span> },
          { header: "Affected record", cell: (a) => { const r = (Array.isArray(a.affectedRecords) ? a.affectedRecords : []) as { entity: string; id: string }[]; return <span className="text-xs text-muted">{r.length ? r.map((x) => `${x.entity} ${x.id.slice(-6)}`).join(", ") : "—"}</span>; } },
          { header: "Risk", cell: (a) => <StatusBadge value={a.risk} /> },
          { header: "Status", cell: (a) => <StatusBadge value={a.status} /> },
          { header: tab === "pending" ? "Requested" : "Decided", cell: (a) => <span className="text-muted">{tab === "pending" ? fmtDate(a.createdAt, true) : `${fmtDate(a.decidedAt ?? a.createdAt, true)}${a.decidedBy ? ` · ${a.decidedBy.name}` : ""}`}</span> },
          { header: "", cell: (a) => (tab === "pending" && canDecide(user, a.requiredPermission) ? <span className="text-xs font-medium text-amber-700">You can decide</span> : null) },
        ]} />
      )}
    </>
  );
}
