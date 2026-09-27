import { db } from "@/lib/db/client";
import type { Prisma } from "@/lib/generated/prisma/client";
import { can } from "@/lib/auth/permissions";
import { requireAccess } from "@/lib/os/guard";
import { AGENTS } from "@/lib/ai/catalog";
import { fmtDate } from "@/components/admin/ui";
import { ListView, LinkCell, StatusBadge, PAGE_SIZE, pageOf, pick, type SP } from "@/components/admin/os";

export const metadata = { title: "AI Logs" };
const STATUSES = ["RUNNING", "SUCCEEDED", "FAILED", "AWAITING_APPROVAL", "BLOCKED", "CANCELLED"] as const;
const TRIGGERS = ["USER", "AUTOMATION", "SCHEDULE", "TASK"] as const;

export default async function LogsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireAccess("ai:view", "AI_WORKFORCE");
  const sp = await searchParams;
  const values = {
    agent: pick(
      sp,
      "agent",
      AGENTS.map((a) => a.slug),
    ),
    status: pick(sp, "status", STATUSES),
    trigger: pick(sp, "trigger", TRIGGERS),
    page: String(pageOf(sp)),
  };
  const page = pageOf(sp);
  // Other people's requests can contain data outside your permissions: only configurators see everyone's logs.
  const where: Prisma.AIExecutionWhereInput = {
    ...(can(user.role, "ai:configure") ? {} : { userId: user.id }),
    agentSlug: values.agent,
    status: values.status,
    trigger: values.trigger,
  };
  const [rows, total] = await Promise.all([
    db.aIExecution.findMany({
      where,
      orderBy: { startedAt: "desc" },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
      include: { user: { select: { name: true } } },
    }),
    db.aIExecution.count({ where }),
  ]);
  return (
    <ListView
      title="AI audit log"
      description="Every agent execution: who asked, which agent and tools, records accessed, actions proposed and executed, tokens and cost."
      crumbs={[{ label: "AI", href: "/admin/ai" }, { label: "Logs" }]}
      basePath="/admin/ai/logs"
      rows={rows}
      total={total}
      page={page}
      values={values}
      filters={[
        {
          type: "select",
          name: "agent",
          label: "Any agent",
          options: AGENTS.map((a) => [a.slug, a.name] as const),
        },
        {
          type: "select",
          name: "status",
          label: "Any status",
          options: STATUSES.map((s) => [s, s.replace(/_/g, " ").toLowerCase()] as const),
        },
        {
          type: "select",
          name: "trigger",
          label: "Any trigger",
          options: TRIGGERS.map((s) => [s, s.toLowerCase()] as const),
        },
      ]}
      empty={{ title: "No AI executions yet." }}
      columns={[
        {
          header: "Request",
          cell: (e) => (
            <LinkCell href={`/admin/ai/logs/${e.id}`} sub={`${e.agentSlug} · ${e.trigger.toLowerCase()} · ${e.mode.toLowerCase()}`}>
              {e.request.slice(0, 140)}
            </LinkCell>
          ),
        },
        {
          header: "User",
          cell: (e) => <span className="text-muted">{e.user?.name ?? "System"}</span>,
        },
        { header: "Status", cell: (e) => <StatusBadge value={e.status} /> },
        {
          header: "Tokens",
          cell: (e) => <span className="tabular-nums text-muted">{(e.inputTokens + e.outputTokens).toLocaleString()}</span>,
        },
        {
          header: "Cost",
          cell: (e) => <span className="tabular-nums text-muted">${Number(e.costUsd).toFixed(4)}</span>,
        },
        {
          header: "When",
          cell: (e) => <span className="text-muted">{fmtDate(e.startedAt, true)}</span>,
        },
      ]}
    />
  );
}
