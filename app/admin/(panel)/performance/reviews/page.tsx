import Link from "next/link";
import { db } from "@/lib/db/client";
import { can } from "@/lib/auth/permissions";
import { requireAccess } from "@/lib/os/guard";
import { employeeWhere } from "@/lib/workforce/access";
import { createReviewAction } from "@/lib/workforce/work-actions";
import { REVIEW_PERIODS } from "@/lib/workforce/constants";
import { DataTable, SelectField, StatusBadge, TextField, enumOptions } from "@/components/admin/os";
import { PageHeader, Panel, label } from "@/components/admin/ui";
import { ActionForm } from "@/components/admin/forms";
import { SubmitButton } from "@/components/admin/client";
import { NoData, PersonCell } from "@/components/admin/workforce/ui";

export const metadata = { title: "Performance reviews" };

export default async function ReviewsPage() {
  const user = await requireAccess("performance:view");
  const scope = can(user.role, "performance:manage") ? {} : await employeeWhere(user);
  const [reviews, people] = await Promise.all([
    db.performanceReview.findMany({ where: { employee: scope }, orderBy: [{ status: "asc" }, { periodStart: "desc" }], take: 300, include: { employee: { select: { id: true, fullName: true, photoUrl: true } } } }),
    db.employee.findMany({ where: { ...scope, archivedAt: null }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true } }),
  ]);
  return (
    <>
      <PageHeader title="Performance reviews" description="Self-review → manager review → HR review → finalised. Metrics are shown as context; ratings are always set by a person." crumbs={[{ label: "Performance", href: "/admin/performance" }, { label: "Reviews" }]} />
      {reviews.length ? <DataTable rows={reviews} columns={[{ header: "Employee", cell: (r) => <PersonCell name={r.employee.fullName} src={r.employee.photoUrl} href={`/admin/performance/reviews/${r.id}`} /> }, { header: "Period", cell: (r) => <Link href={`/admin/performance/reviews/${r.id}`} className="hover:text-brand-blue">{label(r.period)} · {r.periodStart.toISOString().slice(0, 10)} → {r.periodEnd.toISOString().slice(0, 10)}</Link> }, { header: "Stage", cell: (r) => <StatusBadge value={r.status} text={label(r.status)} /> }, { header: "Rating", cell: (r) => r.rating ?? "—" }]} /> : <NoData>No reviews yet.</NoData>}
      {people.length > 0 && (can(user.role, "performance:manage") || can(user.role, "team:view")) && (
        <Panel title="Start a review" className="mt-4">
          <ActionForm action={createReviewAction} resetOnOk className="grid gap-3 sm:grid-cols-5">
            <SelectField name="employeeId" label="Employee" required blank="Choose…" options={people.map((p) => [p.id, p.fullName] as const)} />
            <SelectField name="period" label="Cycle" options={enumOptions(REVIEW_PERIODS)} defaultValue="QUARTERLY" />
            <TextField name="periodStart" type="date" label="Period start" required />
            <TextField name="periodEnd" type="date" label="Period end" required />
            <div className="flex items-end"><SubmitButton>Start</SubmitButton></div>
          </ActionForm>
        </Panel>
      )}
    </>
  );
}
