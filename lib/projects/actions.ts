"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db/client";
import type { Prisma } from "@/lib/generated/prisma/client";
import { audit } from "@/lib/audit";
import { authorizeAccess } from "@/lib/os/guard";
import { fail, formObject, intRange, moneyStr, okThen, optDate, optId, optText, reqText, currency, UserError, type ActionState } from "@/lib/os/action";
import { nextNumber } from "@/lib/os/numbers";
import { logActivity } from "@/lib/os/activity";
import { notify } from "@/lib/os/notify";

const F = "PROJECTS" as const;
const PRIORITY = z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]);
const path = (id: string, tab?: string) => `/admin/projects/${id}${tab ? `?tab=${tab}` : ""}`;

const projectSchema = z.object({
  name: reqText(200),
  clientId: z.string().min(1, "Choose a client").max(40),
  dealId: optId,
  managerId: optId,
  description: optText(20000),
  startDate: optDate,
  targetDate: optDate,
  budget: moneyStr(),
  currency,
  status: z.enum(["PLANNED", "ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED"]),
  priority: PRIORITY,
  health: z.enum(["GREEN", "AMBER", "RED"]).default("GREEN"),
  progress: z.preprocess((v) => (v === "" || v == null ? undefined : v), intRange(0, 100).optional()),
});

/** Progress follows tasks when a project has tasks; otherwise the manual value is kept. */
async function recalcProgress(projectId: string, tx: Prisma.TransactionClient | typeof db = db) {
  const [total, done] = await Promise.all([tx.task.count({ where: { projectId } }), tx.task.count({ where: { projectId, status: "DONE" } })]);
  if (total) await tx.project.update({ where: { id: projectId }, data: { progress: Math.round((done / total) * 100) } });
}

export async function createProjectAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorizeAccess("projects:manage", F);
    const d = projectSchema.parse(formObject(form));
    if (!(await db.client.findFirst({ where: { id: d.clientId, deletedAt: null } }))) throw new UserError("Client not found.");
    if (d.startDate && d.targetDate && d.targetDate < d.startDate) throw new UserError("The target date is before the start date.");
    const p = await db.$transaction(async (tx) => {
      const number = await nextNumber("project", tx);
      const created = await tx.project.create({ data: { ...d, progress: d.progress ?? 0, number, managerId: d.managerId ?? user.id, members: { create: { userId: d.managerId ?? user.id, role: "Project manager" } } } });
      await logActivity({ type: "CREATED", summary: `Project ${number} created`, actorId: user.id, projectId: created.id, clientId: d.clientId, dealId: d.dealId }, tx);
      return created;
    });
    await audit({ userId: user.id, action: "project.created", entity: "Project", entityId: p.id });
    return { ok: `Project ${p.number} created.`, redirect: path(p.id) };
  } catch (e) {
    return fail(e, "projects");
  }
}

export async function updateProjectAction(id: string, _: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorizeAccess("projects:manage", F);
    const before = await db.project.findUnique({ where: { id } });
    if (!before || before.deletedAt) return { error: "Project not found." };
    const d = projectSchema.parse(formObject(form));
    if (d.startDate && d.targetDate && d.targetDate < d.startDate) return { error: "The target date is before the start date." };
    const hasTasks = (await db.task.count({ where: { projectId: id } })) > 0;
    await db.$transaction(async (tx) => {
      await tx.project.update({ where: { id }, data: { ...d, progress: hasTasks ? before.progress : (d.progress ?? before.progress), completedAt: d.status === "COMPLETED" ? (before.completedAt ?? new Date()) : null } });
      if (d.managerId) await tx.projectMember.upsert({ where: { projectId_userId: { projectId: id, userId: d.managerId } }, create: { projectId: id, userId: d.managerId, role: "Project manager" }, update: {} });
      await logActivity({ type: before.status !== d.status ? "STATUS_CHANGED" : "UPDATED", summary: before.status !== d.status ? `${before.status} → ${d.status}` : before.health !== d.health ? `Health ${before.health} → ${d.health}` : undefined, actorId: user.id, projectId: id }, tx);
    });
    await audit({ userId: user.id, action: "project.updated", entity: "Project", entityId: id, metadata: { status: d.status, health: d.health } });
    revalidatePath(path(id));
    return { ok: "Project saved." };
  } catch (e) {
    return fail(e, "projects");
  }
}

export async function addMemberAction(projectId: string, _: ActionState, form: FormData): Promise<ActionState> {
  try {
    await authorizeAccess("projects:manage", F);
    const d = z.object({ userId: z.string().min(1, "Choose a person").max(40), role: optText(80) }).parse(formObject(form));
    if (!(await db.user.findFirst({ where: { id: d.userId, active: true } }))) return { error: "Choose an active user." };
    await db.projectMember.upsert({ where: { projectId_userId: { projectId, userId: d.userId } }, create: { projectId, userId: d.userId, role: d.role }, update: { role: d.role } });
    revalidatePath(path(projectId));
    return { ok: "Team member added." };
  } catch (e) {
    return fail(e, "projects");
  }
}

export async function removeMemberAction(projectId: string, userId: string) {
  await authorizeAccess("projects:manage", F);
  await db.projectMember.deleteMany({ where: { projectId, userId } });
  revalidatePath(path(projectId));
}

/* ───────── milestones ───────── */

const milestoneSchema = z.object({ name: reqText(200), description: optText(5000), dueDate: optDate, amount: moneyStr(), clientVisible: z.preprocess((v) => v === "on", z.boolean()), status: z.enum(["PENDING", "IN_PROGRESS", "COMPLETED", "MISSED"]).default("PENDING") });

export async function saveMilestoneAction(projectId: string, milestoneId: string | null, _: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorizeAccess("projects:manage", F);
    const d = milestoneSchema.parse(formObject(form));
    await db.$transaction(async (tx) => {
      if (milestoneId) {
        const m = await tx.milestone.findFirst({ where: { id: milestoneId, projectId } });
        if (!m) throw new UserError("Milestone not found.");
        await tx.milestone.update({ where: { id: milestoneId }, data: { ...d, completedAt: d.status === "COMPLETED" ? (m.completedAt ?? new Date()) : null } });
        if (m.status !== d.status) await logActivity({ type: "MILESTONE", summary: `${d.name}: ${m.status} → ${d.status}`, actorId: user.id, projectId }, tx);
      } else {
        const count = await tx.milestone.count({ where: { projectId } });
        await tx.milestone.create({ data: { ...d, projectId, sortOrder: count, completedAt: d.status === "COMPLETED" ? new Date() : null } });
        await logActivity({ type: "MILESTONE", summary: `Milestone added: ${d.name}`, actorId: user.id, projectId }, tx);
      }
    });
    revalidatePath(path(projectId, "milestones"));
    return { ok: milestoneId ? "Milestone updated." : "Milestone added." };
  } catch (e) {
    return fail(e, "projects");
  }
}

/* ───────── tasks ───────── */

const taskSchema = z.object({
  title: reqText(200),
  description: optText(10000),
  status: z.enum(["TODO", "IN_PROGRESS", "REVIEW", "BLOCKED", "DONE"]).default("TODO"),
  priority: PRIORITY.default("MEDIUM"),
  assigneeId: optId,
  milestoneId: optId,
  dueDate: optDate,
  startDate: optDate,
  estimateHrs: z.preprocess((v) => (v == null || v === "" ? null : String(v)), z.string().regex(/^\d{1,5}(\.\d{1,2})?$/, "Hours like 4 or 2.5").nullable()),
});

export async function saveTaskAction(projectId: string | null, taskId: string | null, _: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorizeAccess("projects:manage", F);
    const d = taskSchema.parse(formObject(form));
    if (d.milestoneId && projectId && !(await db.milestone.findFirst({ where: { id: d.milestoneId, projectId } }))) return { error: "Milestone not found on this project." };
    const task = await db.$transaction(async (tx) => {
      let t;
      if (taskId) {
        const before = await tx.task.findUnique({ where: { id: taskId } });
        if (!before) throw new UserError("Task not found.");
        t = await tx.task.update({ where: { id: taskId }, data: { ...d, completedAt: d.status === "DONE" ? (before.completedAt ?? new Date()) : null } });
        if (before.status !== d.status && before.projectId) await logActivity({ type: "TASK", summary: `${d.title}: ${before.status} → ${d.status}`, actorId: user.id, projectId: before.projectId }, tx);
      } else {
        t = await tx.task.create({ data: { ...d, projectId, createdById: user.id, completedAt: d.status === "DONE" ? new Date() : null, source: "manual" } });
        if (projectId) await logActivity({ type: "TASK", summary: `Task added: ${d.title}`, actorId: user.id, projectId }, tx);
      }
      if (t.projectId) await recalcProgress(t.projectId, tx);
      return t;
    });
    if (task.assigneeId && task.assigneeId !== user.id) await notify({ type: "task.assigned", title: `Task assigned: ${task.title}`, href: task.projectId ? path(task.projectId, "tasks") : "/admin/tasks?mine=1", userIds: [task.assigneeId] });
    revalidatePath(task.projectId ? path(task.projectId, "tasks") : "/admin/tasks");
    return { ok: taskId ? "Task updated." : "Task added." };
  } catch (e) {
    return fail(e, "projects");
  }
}

/** Kanban move for tasks (project board or the global task board). */
export async function moveTaskAction(id: string, status: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const user = await authorizeAccess("projects:manage", F);
    const to = z.enum(["TODO", "IN_PROGRESS", "REVIEW", "BLOCKED", "DONE"]).parse(status);
    const t = await db.task.findUnique({ where: { id } });
    if (!t) return { ok: false, error: "Task not found." };
    await db.$transaction(async (tx) => {
      await tx.task.update({ where: { id }, data: { status: to, completedAt: to === "DONE" ? new Date() : null } });
      if (t.projectId) {
        await logActivity({ type: "TASK", summary: `${t.title}: ${t.status} → ${to}`, actorId: user.id, projectId: t.projectId }, tx);
        await recalcProgress(t.projectId, tx);
      }
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: fail(e, "projects")?.error };
  }
}

export async function addTaskCommentAction(taskId: string, _: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorizeAccess("projects:manage", F);
    const body = z.string().trim().min(1, "Write a comment").max(5000).parse(form.get("body"));
    const t = await db.task.findUnique({ where: { id: taskId }, select: { projectId: true, assigneeId: true, title: true } });
    if (!t) return { error: "Task not found." };
    await db.taskComment.create({ data: { taskId, authorId: user.id, body } });
    if (t.assigneeId && t.assigneeId !== user.id) await notify({ type: "task.assigned", title: `New comment on "${t.title}"`, body: body.slice(0, 200), href: t.projectId ? path(t.projectId, "tasks") : "/admin/tasks", userIds: [t.assigneeId] });
    revalidatePath(t.projectId ? path(t.projectId, "tasks") : "/admin/tasks");
    return { ok: "Comment added." };
  } catch (e) {
    return fail(e, "projects");
  }
}

/* ───────── issues & change requests ───────── */

export async function saveIssueAction(projectId: string, issueId: string | null, _: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorizeAccess("projects:manage", F);
    const d = z.object({ title: reqText(200), description: optText(10000), severity: PRIORITY.default("MEDIUM"), status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]).default("OPEN"), assigneeId: optId }).parse(formObject(form));
    await db.$transaction(async (tx) => {
      if (issueId) {
        const i = await tx.projectIssue.findFirst({ where: { id: issueId, projectId } });
        if (!i) throw new UserError("Issue not found.");
        await tx.projectIssue.update({ where: { id: issueId }, data: { ...d, resolvedAt: d.status === "RESOLVED" || d.status === "CLOSED" ? (i.resolvedAt ?? new Date()) : null } });
      } else await tx.projectIssue.create({ data: { ...d, projectId, reportedBy: user.name } });
      await logActivity({ type: "ISSUE", summary: `${issueId ? "Issue updated" : "Issue logged"}: ${d.title} (${d.status})`, actorId: user.id, projectId }, tx);
    });
    revalidatePath(path(projectId, "issues"));
    return { ok: issueId ? "Issue updated." : "Issue logged." };
  } catch (e) {
    return fail(e, "projects");
  }
}

export async function saveChangeRequestAction(projectId: string, crId: string | null, _: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorizeAccess("projects:manage", F);
    const d = z.object({ title: reqText(200), description: optText(10000), impactCost: moneyStr(), impactDays: z.preprocess((v) => (v === "" || v == null ? null : v), z.coerce.number().int().min(-3650).max(3650).nullable()), status: z.enum(["PROPOSED", "UNDER_REVIEW", "APPROVED", "REJECTED", "IMPLEMENTED"]).default("PROPOSED") }).parse(formObject(form));
    await db.$transaction(async (tx) => {
      if (crId) {
        const c = await tx.changeRequest.findFirst({ where: { id: crId, projectId } });
        if (!c) throw new UserError("Change request not found.");
        const decided = c.status !== d.status && ["APPROVED", "REJECTED"].includes(d.status);
        await tx.changeRequest.update({ where: { id: crId }, data: { ...d, ...(decided && { decidedById: user.id, decidedAt: new Date() }) } });
        if (c.status !== d.status) await logActivity({ type: "CHANGE_REQUEST", summary: `${d.title}: ${c.status} → ${d.status}`, actorId: user.id, projectId }, tx);
      } else {
        await tx.changeRequest.create({ data: { ...d, projectId, requestedBy: user.name } });
        await logActivity({ type: "CHANGE_REQUEST", summary: `Change request logged: ${d.title}`, actorId: user.id, projectId }, tx);
      }
    });
    await audit({ userId: user.id, action: "project.change_request", entity: "Project", entityId: projectId, metadata: { status: d.status, impactCost: d.impactCost } });
    revalidatePath(path(projectId, "changes"));
    return { ok: "Change request saved." };
  } catch (e) {
    return fail(e, "projects");
  }
}

/* ───────── updates ───────── */

export async function postProjectUpdateAction(projectId: string, _: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorizeAccess("projects:manage", F);
    const d = z.object({ body: z.string().trim().min(1, "Write an update").max(10000), health: z.enum(["GREEN", "AMBER", "RED"]), visibility: z.enum(["INTERNAL", "CLIENT"]), aiDrafted: z.preprocess((v) => v === "1", z.boolean()) }).parse(formObject(form));
    const project = await db.project.findUnique({ where: { id: projectId }, select: { clientId: true, name: true } });
    if (!project) return { error: "Project not found." };
    await db.$transaction(async (tx) => {
      await tx.projectUpdate.create({ data: { ...d, projectId, authorId: user.id } });
      await tx.project.update({ where: { id: projectId }, data: { health: d.health } });
      await logActivity({ type: "UPDATE", summary: `${d.visibility === "CLIENT" ? "Client update" : "Internal update"} posted (${d.health})`, actorId: user.id, projectId, clientId: project.clientId }, tx);
    });
    revalidatePath(path(projectId, "updates"));
    return { ok: d.visibility === "CLIENT" ? "Update published to the client portal." : "Internal update posted." };
  } catch (e) {
    return fail(e, "projects");
  }
}

export async function archiveProjectAction(id: string) {
  const user = await authorizeAccess("projects:manage", F);
  await db.project.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit({ userId: user.id, action: "project.archived", entity: "Project", entityId: id });
  return okThen("/admin/projects", "Project archived.");
}
