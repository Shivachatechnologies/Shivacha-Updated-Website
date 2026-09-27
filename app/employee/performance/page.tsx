import { db } from "@/lib/db/client";
import { requireSelf } from "@/lib/workforce/portal";
import { submitReviewStageAction, updateGoalProgressAction } from "@/lib/workforce/work-actions";
import { GOAL_STATUSES } from "@/lib/workforce/constants";
import { employeeMetrics } from "@/lib/workforce/metrics";
import { fmtMinutes } from "@/lib/workforce/time";
import { KV, Kpi, KpiGrid, SelectField, StatusBadge, TextArea, TextField, enumOptions } from "@/components/admin/os";
import { Panel, label } from "@/components/admin/ui";
import { ActionForm } from "@/components/admin/forms";
import { SubmitButton } from "@/components/admin/client";

export const metadata = { title: "Performance" };

export default async function MyPerformancePage() {
  const { me } = await requireSelf();
  if (!me) return null;
  const from = new Date(new Date().getTime() - 90 * 86_400_000);
  const [goals, reviews, m] = await Promise.all([
    db.performanceGoal.findMany({ where: { employeeId: me.id }, orderBy: [{ status: "asc" }, { dueDate: "asc" }] }),
    db.performanceReview.findMany({ where: { employeeId: me.id }, orderBy: { periodStart: "desc" }, take: 12 }),
    employeeMetrics(me, from),
  ]);
  return (
    <div className="space-y-4">
      <Panel title="Last 90 days (from records)">
        <KpiGrid cols={5}>
          <Kpi label="Days present" value={m.attendance.present} />
          <Kpi label="Punctuality" value={m.attendance.punctualityPct == null ? "—" : `${m.attendance.punctualityPct}%`} />
          <Kpi label="Tasks done" value={m.linked ? m.tasks.done : "—"} />
          <Kpi label="Tickets resolved" value={m.linked ? m.support.resolved : "—"} />
          <Kpi label="Time logged" value={fmtMinutes(m.loggedMinutes)} />
        </KpiGrid>
      </Panel>
      {reviews
        .filter((r) => r.status === "SELF_REVIEW")
        .map((r) => (
          <Panel key={r.id} title={`Self-review · ${label(r.period)} ${r.periodStart.toISOString().slice(0, 10)} → ${r.periodEnd.toISOString().slice(0, 10)}`}>
            <ActionForm action={submitReviewStageAction.bind(null, r.id)} className="space-y-3">
              <TextArea name="achievements" label="Achievements this period" rows={4} defaultValue={r.achievements ?? ""} />
              <TextArea name="selfComments" label="Comments, blockers, support you need" rows={3} defaultValue={r.selfComments ?? ""} />
              <SubmitButton>Submit to my manager</SubmitButton>
            </ActionForm>
          </Panel>
        ))}
      <Panel title="My goals">
        {goals.length ? (
          <ul className="divide-y divide-line">
            {goals.map((g) => (
              <li key={g.id} className="grid gap-2 py-3 sm:grid-cols-[1fr_auto] sm:items-end">
                <div>
                  <p className="text-sm font-medium">{g.objective}</p>
                  {g.keyResult && <p className="text-xs text-muted">{g.keyResult}</p>}
                  <p className="text-xs text-dim">
                    {g.target ? `Target ${Number(g.target)} ${g.unit ?? ""}` : "No numeric target"}
                    {g.dueDate ? ` · due ${g.dueDate.toISOString().slice(0, 10)}` : ""}
                  </p>
                </div>
                {g.status === "ACHIEVED" || g.status === "CANCELLED" ? (
                  <StatusBadge value={g.status} text={label(g.status)} />
                ) : (
                  <ActionForm action={updateGoalProgressAction.bind(null, g.id)} className="flex flex-wrap items-end gap-2">
                    <TextField id={`cur-${g.id}`} name="current" type="number" label="Progress" defaultValue={Number(g.current)} />
                    <SelectField id={`st-${g.id}`} name="status" label="Status" options={enumOptions(GOAL_STATUSES)} defaultValue={g.status} />
                    <SubmitButton variant="secondary">Update</SubmitButton>
                  </ActionForm>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Your manager has not set goals for you yet.</p>
        )}
      </Panel>
      <Panel title="Reviews">
        {reviews.filter((r) => r.status !== "SELF_REVIEW").length ? (
          <div className="space-y-4">
            {reviews
              .filter((r) => r.status !== "SELF_REVIEW")
              .map((r) => (
                <div key={r.id} className="rounded-lg border border-line p-3">
                  <p className="mb-2 flex items-center gap-2 text-sm font-medium">
                    {label(r.period)} {r.periodStart.toISOString().slice(0, 10)} → {r.periodEnd.toISOString().slice(0, 10)} <StatusBadge value={r.status} text={label(r.status)} />
                  </p>
                  <KV cols={1} items={r.status === "FINALIZED" ? [["Your achievements", r.achievements], ["Manager comments", r.managerComments], ["Development areas", r.developmentAreas], ["Rating", r.rating], ["HR comments", r.hrComments]] : [["Your achievements", r.achievements], ["Status", "With your manager or HR. You'll see their comments once it is finalised."]]} />
                </div>
              ))}
          </div>
        ) : (
          <p className="text-sm text-muted">No submitted reviews yet.</p>
        )}
      </Panel>
    </div>
  );
}
