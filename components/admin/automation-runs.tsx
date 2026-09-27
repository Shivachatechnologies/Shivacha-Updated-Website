import { db } from "@/lib/db/client";
import type { Prisma } from "@/lib/generated/prisma/client";
import { TRIGGER_INFO } from "@/lib/automation/rules";
import { hrefFor } from "@/lib/automation/href";
import { LinkCell, ListView, StatusBadge, pageOf, str, PAGE_SIZE, type SP } from "./os";
import { fmtDate } from "./ui";

export async function RunsList({ sp, failuresOnly }: { sp: SP; failuresOnly?: boolean }) {
  const values = { status: failuresOnly ? undefined : str(sp, "status", 20) || undefined, page: str(sp, "page") };
  const where: Prisma.AutomationRunWhereInput = failuresOnly ? { status: { in: ["FAILED", "PARTIAL"] } } : values.status ? { status: values.status as "FAILED" } : {};
  const page = pageOf(sp);
  const [total, rows] = await Promise.all([db.automationRun.count({ where }), db.automationRun.findMany({ where, orderBy: { startedAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, include: { automation: { select: { id: true, name: true } } } })]);
  return (
    <ListView
      title={failuresOnly ? "Automation failures" : "Automation runs"}
      description={failuresOnly ? "Runs where at least one action failed. Nothing is retried automatically." : "Every execution with its steps and result."}
      crumbs={[{ label: "Automations", href: "/admin/automations" }, { label: failuresOnly ? "Failures" : "Runs" }]}
      values={values}
      filters={failuresOnly ? undefined : [{ type: "select", name: "status", label: "Any result", options: [["SUCCEEDED", "Succeeded"], ["PARTIAL", "Partial"], ["FAILED", "Failed"], ["SKIPPED", "Skipped (conditions)"], ["RUNNING", "Running"]] }]}
      rows={rows}
      total={total}
      page={page}
      basePath={failuresOnly ? "/admin/automations/failures" : "/admin/automations/runs"}
      empty={{ title: failuresOnly ? "No failures" : "No runs yet" }}
      columns={[
        { header: "When", cell: (r) => <LinkCell href={`/admin/automations/runs/${r.id}`}>{fmtDate(r.startedAt, true)}</LinkCell> },
        { header: "Automation", cell: (r) => <LinkCell href={`/admin/automations/${r.automation.id}`}>{r.automation.name}</LinkCell> },
        { header: "Trigger", cell: (r) => <span className="text-muted">{TRIGGER_INFO[r.trigger].label}</span> },
        { header: "Record", cell: (r) => (r.entity && r.entityId && hrefFor({ entity: r.entity, entityId: r.entityId }) ? <LinkCell href={hrefFor({ entity: r.entity, entityId: r.entityId })!}>{r.entity}</LinkCell> : <span className="text-muted">—</span>) },
        { header: "Result", cell: (r) => <StatusBadge value={r.status} /> },
        { header: "Error", cell: (r) => <span className="block max-w-[260px] truncate text-xs text-red-700">{r.error ?? ((r.steps as { status: string; detail?: string }[] | null) ?? []).find((s) => s.status === "failed")?.detail ?? ""}</span> },
      ]}
    />
  );
}
