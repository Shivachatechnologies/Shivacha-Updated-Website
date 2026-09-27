"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { audit } from "@/lib/audit";
import { authorize } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { fail, formObject, okThen, optDate, optId, optText, reqText, UserError, type ActionState } from "@/lib/os/action";
import { notify } from "@/lib/os/notify";
import { isManagerOf, myEmployee } from "./access";
import { GOAL_STATUSES, REVIEW_PERIODS } from "./constants";

const bool = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());
const hhmm = z.preprocess((v) => (v == null ? "" : v), z.string().regex(/^(([01]\d|2[0-3]):[0-5]\d)?$/, "Use HH:MM"));

/* ───────── timesheets ───────── */

const logSchema = z.object({ date: optDate.refine((v) => !!v, "Required"), projectId: optId, taskId: optId, start: hhmm, end: hhmm, minutes: z.preprocess((v) => (v == null || v === "" ? null : Number(v)), z.number().int().min(1).max(1440).nullable()), billable: bool, notes: optText(1000) });

export async function logTimeAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorize("selfservice:use");
    const me = await myEmployee(user.id);
    if (!me) throw new UserError("Your login is not linked to an employee record.");
    const d = logSchema.parse({ ...formObject(form), billable: form.get("billable") });
    const toMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
    const minutes = d.start && d.end ? toMin(d.end) - toMin(d.start) : d.minutes;
    if (!minutes || minutes <= 0) throw new UserError("Enter a start and end time, or a duration in minutes.");
    if (d.date! > new Date()) throw new UserError("You cannot log time in the future.");
    if (d.taskId) {
      const t = await db.task.findUnique({ where: { id: d.taskId }, select: { projectId: true } });
      if (!t) throw new UserError("Task not found.");
      d.projectId ??= t.projectId;
    }
    if (d.projectId && !can(user.role, "projects:view")) {
      const ok = await db.project.count({ where: { id: d.projectId, OR: [{ managerId: user.id }, { members: { some: { userId: user.id } } }, { tasks: { some: { assigneeId: user.id } } }] } });
      if (!ok) throw new UserError("You can only log time to projects you work on.");
    }
    const day = d.date!.toISOString().slice(0, 10);
    const row = await db.timesheet.create({ data: { employeeId: me.id, projectId: d.projectId, taskId: d.taskId, date: d.date!, startAt: d.start ? new Date(`${day}T${d.start}:00Z`) : null, endAt: d.end ? new Date(`${day}T${d.end}:00Z`) : null, minutes, billable: d.billable, notes: d.notes, status: "SUBMITTED" } });
    await audit({ userId: user.id, action: "timesheet.logged", entity: "Timesheet", entityId: row.id, metadata: { minutes } });
    return okThen("/employee/timesheets", "Time logged.");
  } catch (e) {
    return fail(e, "timesheets");
  }
}

export async function deleteTimeAction(id: string, _s?: ActionState, _f?: FormData): Promise<ActionState> {
  try {
    const user = await authorize("selfservice:use");
    const me = await myEmployee(user.id);
    const row = await db.timesheet.findUnique({ where: { id } });
    if (!me || !row || row.employeeId !== me.id) throw new UserError("Entry not found.");
    if (row.status === "APPROVED") throw new UserError("Approved entries cannot be deleted.");
    await db.timesheet.delete({ where: { id } });
    await audit({ userId: user.id, action: "timesheet.deleted", entity: "Timesheet", entityId: id });
    return okThen("/employee/timesheets", "Entry deleted.");
  } catch (e) {
    return fail(e, "timesheets");
  }
}

export async function decideTimesheetAction(id: string, decision: "APPROVED" | "REJECTED", _s?: ActionState, _f?: FormData): Promise<ActionState> {
  try {
    const user = await authorize("timesheets:approve");
    const row = await db.timesheet.findUnique({ where: { id }, include: { employee: { select: { userId: true } } } });
    if (!row) throw new UserError("Entry not found.");
    const hr = can(user.role, "employees:view");
    if (!hr && !(await isManagerOf(user, row.employeeId))) throw new UserError("You are not this employee's approver.");
    if (row.employee.userId === user.id) throw new UserError("You cannot approve your own time.");
    await db.timesheet.update({ where: { id }, data: { status: decision, decidedById: user.id, decidedAt: new Date() } });
    await notify({ type: "timesheet.decided", title: `Timesheet entry ${decision === "APPROVED" ? "approved" : "rejected"}`, href: "/employee/timesheets", userIds: [row.employee.userId] });
    await audit({ userId: user.id, action: `timesheet.${decision.toLowerCase()}`, entity: "Timesheet", entityId: id });
    revalidatePath("/admin/timesheets");
    revalidatePath("/admin/team");
    return { ok: decision === "APPROVED" ? "Approved." : "Rejected." };
  } catch (e) {
    return fail(e, "timesheets");
  }
}

/* ───────── goals / OKRs ───────── */

async function canManagePerformance(user: Awaited<ReturnType<typeof authorize>>, employeeId: string) {
  if (can(user.role, "performance:manage")) return true;
  return isManagerOf(user, employeeId);
}

const goalSchema = z.object({ employeeId: z.string().min(1, "Choose an employee").max(40), objective: reqText(300), keyResult: optText(300), target: z.preprocess((v) => (v == null || v === "" ? null : Number(v)), z.number().min(0).max(1e12).nullable()), unit: optText(30), dueDate: optDate, status: z.enum(GOAL_STATUSES), projectId: optId, dealId: optId });

export async function saveGoalAction(id: string | null, _: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorize();
    const d = goalSchema.parse(formObject(form));
    if (!(await canManagePerformance(user, d.employeeId))) throw new UserError("You can set goals only for your team.");
    const data = { ...d, target: d.target?.toFixed(2) ?? null };
    const row = id ? await db.performanceGoal.update({ where: { id }, data }) : await db.performanceGoal.create({ data: { ...data, managerId: user.id, createdById: user.id } });
    await audit({ userId: user.id, action: id ? "goal.updated" : "goal.created", entity: "PerformanceGoal", entityId: row.id });
    return okThen("/admin/performance/goals", "Goal saved.");
  } catch (e) {
    return fail(e, "performance");
  }
}

/** Progress is updated by the goal owner or their manager (a real value, never computed from surveillance). */
export async function updateGoalProgressAction(id: string, _: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorize();
    const goal = await db.performanceGoal.findUnique({ where: { id } });
    if (!goal) throw new UserError("Goal not found.");
    const me = await myEmployee(user.id);
    if (me?.id !== goal.employeeId && !(await canManagePerformance(user, goal.employeeId))) throw new UserError("Not allowed.");
    const d = z.object({ current: z.coerce.number().min(0).max(1e12), status: z.enum(GOAL_STATUSES) }).parse(formObject(form));
    await db.performanceGoal.update({ where: { id }, data: { current: d.current.toFixed(2), status: d.status } });
    await audit({ userId: user.id, action: "goal.progress", entity: "PerformanceGoal", entityId: id, metadata: d });
    revalidatePath("/admin/performance/goals");
    revalidatePath("/employee/performance");
    return { ok: "Progress updated." };
  } catch (e) {
    return fail(e, "performance");
  }
}

/* ───────── reviews: self → manager → HR → finalised ───────── */

export async function createReviewAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorize();
    const d = z.object({ employeeId: z.string().min(1, "Choose an employee").max(40), period: z.enum(REVIEW_PERIODS), periodStart: optDate.refine((v) => !!v, "Required"), periodEnd: optDate.refine((v) => !!v, "Required") }).parse(formObject(form));
    if (!(await canManagePerformance(user, d.employeeId))) throw new UserError("You can start reviews only for your team.");
    if (d.periodEnd! < d.periodStart!) throw new UserError("Period end is before its start.");
    const r = await db.performanceReview.create({ data: { employeeId: d.employeeId, period: d.period, periodStart: d.periodStart!, periodEnd: d.periodEnd!, reviewerId: user.id, createdById: user.id } });
    const emp = await db.employee.findUnique({ where: { id: d.employeeId }, select: { userId: true } });
    await notify({ type: "review.stage", title: "Your self-review is open", href: "/employee/performance", userIds: [emp?.userId] });
    await audit({ userId: user.id, action: "review.created", entity: "PerformanceReview", entityId: r.id });
    return okThen("/admin/performance/reviews", "Review started — the employee has been asked for a self-review.");
  } catch (e) {
    return fail(e, "performance");
  }
}

export async function submitReviewStageAction(id: string, _: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorize();
    const r = await db.performanceReview.findUnique({ where: { id }, include: { employee: { select: { id: true, userId: true, fullName: true, manager: { select: { userId: true } } } } } });
    if (!r) throw new UserError("Review not found.");
    const text = (k: string) => optText(8000).parse(form.get(k));
    if (r.status === "SELF_REVIEW") {
      if (r.employee.userId !== user.id) throw new UserError("Only the employee can submit the self-review.");
      await db.performanceReview.update({ where: { id }, data: { achievements: text("achievements"), selfComments: text("selfComments"), status: "MANAGER_REVIEW" } });
      await notify({ type: "review.stage", title: `${r.employee.fullName} submitted a self-review`, href: `/admin/performance/reviews/${id}`, userIds: [r.employee.manager?.userId, r.reviewerId] });
    } else if (r.status === "MANAGER_REVIEW") {
      if (!(await canManagePerformance(user, r.employeeId))) throw new UserError("Only the employee's manager can complete this step.");
      const rating = z.preprocess((v) => (v == null || v === "" ? null : Number(v)), z.number().int().min(1).max(5).nullable()).parse(form.get("rating"));
      await db.performanceReview.update({ where: { id }, data: { managerComments: text("managerComments"), developmentAreas: text("developmentAreas"), rating, status: "HR_REVIEW" } });
      await notify({ type: "review.stage", title: `${r.employee.fullName}'s review is ready for HR`, href: `/admin/performance/reviews/${id}`, permission: "performance:manage", exceptUserId: user.id });
    } else if (r.status === "HR_REVIEW") {
      if (!can(user.role, "performance:manage")) throw new UserError("HR completes this step.");
      await db.performanceReview.update({ where: { id }, data: { hrComments: text("hrComments"), status: "FINALIZED", finalizedAt: new Date() } });
      await notify({ type: "review.stage", title: "Your performance review was finalised", href: "/employee/performance", userIds: [r.employee.userId] });
    } else throw new UserError("This review is finalised.");
    await audit({ userId: user.id, action: "review.stage", entity: "PerformanceReview", entityId: id, metadata: { from: r.status } });
    revalidatePath(`/admin/performance/reviews/${id}`);
    revalidatePath("/employee/performance");
    return { ok: "Saved." };
  } catch (e) {
    return fail(e, "performance");
  }
}

/* ───────── announcements ───────── */

export async function saveAnnouncementAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorize("employees:manage");
    const d = z.object({ title: reqText(160), body: reqText(5000), departmentId: optId, expiresAt: optDate }).parse(formObject(form));
    const a = await db.announcement.create({ data: { ...d, createdById: user.id } });
    const recipients = await db.employee.findMany({ where: { archivedAt: null, userId: { not: null }, ...(d.departmentId ? { departmentId: d.departmentId } : {}) }, select: { userId: true } });
    await notify({ type: "announcement", title: d.title, href: "/employee", userIds: recipients.map((r) => r.userId), exceptUserId: user.id });
    await audit({ userId: user.id, action: "announcement.created", entity: "Announcement", entityId: a.id });
    return okThen("/admin/announcements", "Announcement published.");
  } catch (e) {
    return fail(e, "announcements");
  }
}

export async function deleteAnnouncementAction(id: string, _s?: ActionState, _f?: FormData): Promise<ActionState> {
  try {
    const user = await authorize("employees:manage");
    await db.announcement.delete({ where: { id } });
    await audit({ userId: user.id, action: "announcement.deleted", entity: "Announcement", entityId: id });
    return okThen("/admin/announcements", "Announcement removed.");
  } catch (e) {
    return fail(e, "announcements");
  }
}

/** Employees update their own contact details in self-service (identity/employment fields stay with HR). */
export async function updateMyContactAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorize("selfservice:use");
    const me = await myEmployee(user.id);
    if (!me) throw new UserError("No employee record.");
    const phone = z.preprocess((v) => (v == null ? "" : v), z.string().trim().max(40)).refine((v) => !v || /^[+\d][\d\s()-]{6,}$/.test(v), "Invalid phone").transform((v) => v || null);
    const d = z.object({ personalPhone: phone, emergencyName: optText(160), emergencyPhone: phone, emergencyRelation: optText(60) }).parse(formObject(form));
    await db.employee.update({ where: { id: me.id }, data: d });
    await audit({ userId: user.id, action: "employee.self.updated", entity: "Employee", entityId: me.id, metadata: { fields: Object.keys(d) } });
    revalidatePath("/employee/profile");
    return { ok: "Profile updated." };
  } catch (e) {
    return fail(e, "employees");
  }
}

