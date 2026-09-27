import { notFound } from "next/navigation";
import { db } from "@/lib/db/client";
import { can } from "@/lib/auth/permissions";
import { requireAccess } from "@/lib/os/guard";
import { AuthError } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { assertEmployeeAccess, isManagerOf } from "@/lib/workforce/access";
import { employeeMetrics } from "@/lib/workforce/metrics";
import { submitReviewStageAction } from "@/lib/workforce/work-actions";
import { fmtMinutes } from "@/lib/workforce/time";
import { KV, Kpi, KpiGrid, SelectField, StatusBadge, TextArea } from "@/components/admin/os";
import { PageHeader, Panel, label } from "@/components/admin/ui";
import { ActionForm } from "@/components/admin/forms";
import { SubmitButton } from "@/components/admin/client";

export const metadata = { title: "Performance review" };

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAccess("performance:view");
  const { id } = await params;
  const r = await db.performanceReview.findUnique({ where: { id }, include: { employee: { select: { id: true, fullName: true, userId: true } } } });
  if (!r) notFound();
  try {
    await assertEmployeeAccess(user, r.employeeId);
  } catch (e) {
    if (e instanceof AuthError) notFound();
    throw e;
  }
  await audit({ userId: user.id, action: "review.viewed", entity: "PerformanceReview", entityId: id });
  const m = await employeeMetrics(r.employee, r.periodStart, r.periodEnd);
  const manager = can(user.role, "performance:manage") || (await isManagerOf(user, r.employeeId));
  return (
    <>
      <PageHeader title={`${r.employee.fullName} — ${label(r.period)} review`} description={`${r.periodStart.toISOString().slice(0, 10)} → ${r.periodEnd.toISOString().slice(0, 10)}`} crumbs={[{ label: "Reviews", href: "/admin/performance/reviews" }, { label: r.employee.fullName }]} actions={<StatusBadge value={r.status} text={label(r.status)} />} />
      <Panel title="Facts for this period (from records)" className="mb-4">
        <KpiGrid cols={6}>
          <Kpi label="Days present" value={m.attendance.present} />
          <Kpi label="Punctuality" value={m.attendance.punctualityPct == null ? "—" : `${m.attendance.punctualityPct}%`} />
          <Kpi label="Tasks done" value={m.linked ? m.tasks.done : "—"} />
          <Kpi label="Projects completed" value={m.linked ? m.projectsCompleted : "—"} />
          <Kpi label="Tickets resolved" value={m.linked ? m.support.resolved : "—"} />
          <Kpi label="Time logged" value={fmtMinutes(m.loggedMinutes)} />
        </KpiGrid>
      </Panel>
      <Panel title="Review" className="mb-4">
        <KV cols={1} items={[["Achievements (employee)", r.achievements], ["Employee comments", r.selfComments], ["Manager comments", r.managerComments], ["Development areas", r.developmentAreas], ["Rating (manager, 1–5)", r.rating], ["HR comments", r.hrComments]]} />
      </Panel>
      {r.status === "MANAGER_REVIEW" && manager && (
        <Panel title="Manager review">
          <ActionForm action={submitReviewStageAction.bind(null, id)} className="space-y-3">
            <TextArea name="managerComments" label="Manager comments" rows={4} />
            <TextArea name="developmentAreas" label="Development areas" rows={3} />
            <SelectField name="rating" label="Rating (optional)" blank="No rating" options={[["1", "1"], ["2", "2"], ["3", "3"], ["4", "4"], ["5", "5"]]} />
            <SubmitButton>Submit to HR</SubmitButton>
          </ActionForm>
        </Panel>
      )}
      {r.status === "HR_REVIEW" && can(user.role, "performance:manage") && (
        <Panel title="HR review">
          <ActionForm action={submitReviewStageAction.bind(null, id)} className="space-y-3">
            <TextArea name="hrComments" label="HR comments" rows={4} />
            <SubmitButton>Finalise review</SubmitButton>
          </ActionForm>
        </Panel>
      )}
      {r.status === "SELF_REVIEW" && <p className="text-sm text-muted">Waiting for {r.employee.fullName}&apos;s self-review in their portal.</p>}
    </>
  );
}
