"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { audit } from "@/lib/audit";
import { authorize } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { fail, formObject, okThen, optDate, optText, reqText, UserError, type ActionState } from "@/lib/os/action";
import { notify } from "@/lib/os/notify";
import { isManagerOf, myEmployee } from "./access";
import { dateKey, leaveDays } from "./time";

const bool = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());

export async function saveLeaveTypeAction(id: string | null, _: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorize("leave:manage");
    const d = z.object({ name: reqText(80), code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_]{1,12}$/, "Letters, digits, underscore"), annualQuota: z.coerce.number().min(0).max(365), paid: bool, requiresHrApproval: bool, active: bool }).parse({ ...formObject(form), paid: form.get("paid"), requiresHrApproval: form.get("requiresHrApproval"), active: form.get("active") });
    const data = { ...d, annualQuota: d.annualQuota.toFixed(1) };
    const row = id ? await db.leaveType.update({ where: { id }, data }) : await db.leaveType.create({ data });
    await audit({ userId: user.id, action: id ? "leave.type.updated" : "leave.type.created", entity: "LeaveType", entityId: row.id });
    return okThen("/admin/leave?tab=types", "Leave type saved.");
  } catch (e) {
    return fail(e, "leave");
  }
}

export async function saveHolidayAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorize("leave:manage");
    const d = z.object({ date: optDate.refine((v) => !!v, "Required"), name: reqText(120), officeId: z.preprocess((v) => v || null, z.string().max(40).nullable()), optional: bool }).parse({ ...formObject(form), optional: form.get("optional") });
    const row = await db.holiday.create({ data: { date: d.date!, name: d.name, officeId: d.officeId, optional: d.optional } });
    await audit({ userId: user.id, action: "holiday.created", entity: "Holiday", entityId: row.id });
    return okThen("/admin/leave?tab=holidays", "Holiday added.");
  } catch (e) {
    return fail(e, "leave");
  }
}

export async function deleteHolidayAction(id: string, _s?: ActionState, _f?: FormData): Promise<ActionState> {
  try {
    const user = await authorize("leave:manage");
    await db.holiday.delete({ where: { id } });
    await audit({ userId: user.id, action: "holiday.deleted", entity: "Holiday", entityId: id });
    return okThen("/admin/leave?tab=holidays", "Holiday removed.");
  } catch (e) {
    return fail(e, "leave");
  }
}

/** Creates missing balances for the year from each active leave type's quota (never lowers an existing balance). */
export async function allocateBalancesAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorize("leave:manage");
    const year = z.coerce.number().int().min(2020).max(2100).parse(form.get("year"));
    const [types, emps] = await Promise.all([db.leaveType.findMany({ where: { active: true } }), db.employee.findMany({ where: { archivedAt: null, status: { notIn: ["RESIGNED", "TERMINATED", "INACTIVE"] } }, select: { id: true } })]);
    const r = await db.leaveBalance.createMany({ data: emps.flatMap((e) => types.map((t) => ({ employeeId: e.id, leaveTypeId: t.id, year, allocated: t.annualQuota }))), skipDuplicates: true });
    await audit({ userId: user.id, action: "leave.balances.allocated", metadata: { year, created: r.count } });
    return okThen("/admin/leave?tab=balances", `Created ${r.count} balance(s) for ${year}.`);
  } catch (e) {
    return fail(e, "leave");
  }
}

export async function adjustBalanceAction(id: string, _: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorize("leave:manage");
    const allocated = z.coerce.number().min(0).max(365).parse(form.get("allocated"));
    await db.leaveBalance.update({ where: { id }, data: { allocated: allocated.toFixed(1) } });
    await audit({ userId: user.id, action: "leave.balance.adjusted", entity: "LeaveBalance", entityId: id, metadata: { allocated } });
    revalidatePath("/admin/leave");
    return { ok: "Balance updated." };
  } catch (e) {
    return fail(e, "leave");
  }
}

const applySchema = z.object({ leaveTypeId: z.string().min(1, "Choose a leave type").max(40), startDate: optDate.refine((v) => !!v, "Required"), endDate: optDate.refine((v) => !!v, "Required"), halfDay: bool, reason: optText(1000) });

export async function applyLeaveAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorize("selfservice:use");
    const me = await myEmployee(user.id);
    if (!me) throw new UserError("Your login is not linked to an employee record.");
    const d = applySchema.parse({ ...formObject(form), halfDay: form.get("halfDay") });
    const start = d.startDate!;
    const end = d.endDate!;
    if (end < start) throw new UserError("The end date is before the start date.");
    if (d.halfDay && dateKey(start) !== dateKey(end)) throw new UserError("A half day must start and end on the same date.");
    const type = await db.leaveType.findFirst({ where: { id: d.leaveTypeId, active: true } });
    if (!type) throw new UserError("Leave type not found.");
    const overlap = await db.leaveRequest.findFirst({ where: { employeeId: me.id, status: { in: ["PENDING_MANAGER", "PENDING_HR", "APPROVED"] }, startDate: { lte: end }, endDate: { gte: start } } });
    if (overlap) throw new UserError("You already have leave requested for part of these dates.");
    const holidays = await db.holiday.findMany({ where: { date: { gte: start, lte: end }, OR: [{ officeId: null }, { officeId: me.officeId ?? undefined }] }, select: { date: true } });
    const n = leaveDays(start, end, me.shift?.weekDays ?? me.workingDays, new Set(holidays.map((h) => dateKey(h.date))), d.halfDay);
    if (n <= 0) throw new UserError("Those dates contain no working days.");
    const bal = await db.leaveBalance.findUnique({ where: { employeeId_leaveTypeId_year: { employeeId: me.id, leaveTypeId: type.id, year: start.getUTCFullYear() } } });
    if (type.paid && Number(type.annualQuota) > 0 && (!bal || Number(bal.allocated) - Number(bal.used) < n)) throw new UserError(`Not enough ${type.name} balance (${bal ? Number(bal.allocated) - Number(bal.used) : 0} day(s) left).`);
    const status = me.managerId ? "PENDING_MANAGER" : "PENDING_HR";
    const req = await db.leaveRequest.create({ data: { employeeId: me.id, leaveTypeId: type.id, startDate: start, endDate: end, halfDay: d.halfDay, days: n.toFixed(1), reason: d.reason, status } });
    const managerUser = me.manager?.userId;
    await notify({ type: "leave.requested", title: `${me.fullName} requested ${n} day(s) of ${type.name}`, href: managerUser ? "/admin/team?tab=approvals" : "/admin/leave", userIds: status === "PENDING_MANAGER" ? [managerUser] : [], permission: status === "PENDING_HR" ? "leave:manage" : undefined, exceptUserId: user.id });
    await audit({ userId: user.id, action: "leave.requested", entity: "LeaveRequest", entityId: req.id, metadata: { days: n, type: type.code } });
    return okThen("/employee/leave", "Leave requested.");
  } catch (e) {
    return fail(e, "leave");
  }
}

export async function cancelLeaveAction(id: string, _s?: ActionState, _f?: FormData): Promise<ActionState> {
  try {
    const user = await authorize("selfservice:use");
    const me = await myEmployee(user.id);
    const req = await db.leaveRequest.findUnique({ where: { id } });
    if (!me || !req || req.employeeId !== me.id) throw new UserError("Request not found.");
    if (!["PENDING_MANAGER", "PENDING_HR"].includes(req.status)) throw new UserError("Only pending requests can be cancelled. Ask HR to cancel approved leave.");
    await db.leaveRequest.update({ where: { id }, data: { status: "CANCELLED" } });
    await audit({ userId: user.id, action: "leave.cancelled", entity: "LeaveRequest", entityId: id });
    return okThen("/employee/leave", "Request cancelled.");
  } catch (e) {
    return fail(e, "leave");
  }
}

/**
 * Two-step approval: the manager decides first (anyone in the employee's reporting line with leave:approve), then HR
 * (leave:manage) when the leave type requires it or the employee has no manager. HR may decide at either step.
 */
export async function decideLeaveAction(id: string, decision: "APPROVE" | "REJECT", _: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorize();
    const note = optText(500).parse(form.get("note"));
    const req = await db.leaveRequest.findUnique({ where: { id }, include: { leaveType: true, employee: { select: { id: true, fullName: true, userId: true } } } });
    if (!req) throw new UserError("Request not found.");
    const hr = can(user.role, "leave:manage");
    const me = await myEmployee(user.id);
    if (me?.id === req.employeeId) throw new UserError("You cannot decide your own leave.");
    const now = new Date();
    let next: "PENDING_HR" | "APPROVED" | "REJECTED";
    if (req.status === "PENDING_MANAGER") {
      if (!hr && !(can(user.role, "leave:approve") && (await isManagerOf(user, req.employeeId)))) throw new UserError("You are not this employee's approver.");
      next = decision === "REJECT" ? "REJECTED" : req.leaveType.requiresHrApproval && !hr ? "PENDING_HR" : "APPROVED";
      await db.leaveRequest.update({ where: { id }, data: { status: next, managerId: user.id, managerDecidedAt: now, managerNote: note, ...(hr && next !== "PENDING_HR" ? { hrId: user.id, hrDecidedAt: now } : {}) } });
    } else if (req.status === "PENDING_HR") {
      if (!hr) throw new UserError("HR approval is required for this request.");
      next = decision === "REJECT" ? "REJECTED" : "APPROVED";
      await db.leaveRequest.update({ where: { id }, data: { status: next, hrId: user.id, hrDecidedAt: now, hrNote: note } });
    } else throw new UserError("This request has already been decided.");

    if (next === "APPROVED") {
      const year = req.startDate.getUTCFullYear();
      await db.leaveBalance.updateMany({ where: { employeeId: req.employeeId, leaveTypeId: req.leaveTypeId, year }, data: { used: { increment: req.days } } });
      // Reflect approved leave on the attendance calendar (real, derived rows).
      for (let t = req.startDate.getTime(); t <= req.endDate.getTime(); t += 86_400_000) {
        const date = new Date(t);
        await db.attendanceDay.upsert({ where: { employeeId_date: { employeeId: req.employeeId, date } }, update: {}, create: { employeeId: req.employeeId, date, status: "ON_LEAVE", source: "LEAVE" } });
        await db.attendanceDay.updateMany({ where: { employeeId: req.employeeId, date, checkInAt: null }, data: { status: "ON_LEAVE", source: "LEAVE" } });
      }
    }
    if (next === "PENDING_HR") await notify({ type: "leave.requested", title: `${req.employee.fullName}'s ${req.leaveType.name} needs HR approval`, href: "/admin/leave", permission: "leave:manage", exceptUserId: user.id });
    else await notify({ type: "leave.decided", title: `Your ${req.leaveType.name} request was ${next === "APPROVED" ? "approved" : "rejected"}`, body: note ?? undefined, href: "/employee/leave", userIds: [req.employee.userId] });
    await audit({ userId: user.id, action: next === "REJECTED" ? "leave.rejected" : "leave.approved", entity: "LeaveRequest", entityId: id, metadata: { stage: req.status, next } });
    revalidatePath("/admin/leave");
    revalidatePath("/admin/team");
    return { ok: next === "PENDING_HR" ? "Approved — sent to HR." : next === "APPROVED" ? "Leave approved." : "Leave rejected." };
  } catch (e) {
    return fail(e, "leave");
  }
}
