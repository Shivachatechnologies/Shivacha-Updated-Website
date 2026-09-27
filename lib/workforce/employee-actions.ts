"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db/client";
import type { Prisma } from "@/lib/generated/prisma/client";
import { audit } from "@/lib/audit";
import { authorize } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { fail, formObject, moneyStr, okThen, optDate, optEmail, optId, optText, reqText, currency, UserError, type ActionState } from "@/lib/os/action";
import { MAX_DOCUMENT_BYTES, safeName, sniffDocument } from "@/lib/os/documents";
import { assertEmployeeAccess } from "./access";
import { EMPLOYMENT_STATUSES, EMPLOYMENT_TYPES, WORK_MODES } from "./constants";
import { deleteHrDocument, HR_DOC_KINDS, HR_DOC_TYPES, storeHrDocument } from "./documents";


const days = z.preprocess((v) => (v == null ? [] : Array.isArray(v) ? v : [v]), z.array(z.coerce.number().int().min(1).max(7))).transform((a) => [...new Set(a)].sort());
const tz = z.preprocess((v) => (v == null ? "" : v), z.string().trim().max(60)).refine((v) => {
  if (!v) return true;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: v });
    return true;
  } catch {
    return false;
  }
}, "Unknown time zone").transform((v) => v || null);
const phone = z.preprocess((v) => (v == null ? "" : v), z.string().trim().max(40)).refine((v) => !v || /^[+\d][\d\s()-]{6,}$/.test(v), "Invalid phone number").transform((v) => v || null);

const employeeSchema = z.object({
  fullName: reqText(160),
  photoUrl: z.preprocess((v) => (v == null ? "" : v), z.string().trim().max(500)).refine((v) => !v || /^(https:\/\/|\/)/.test(v), "Use an https:// or site URL").transform((v) => v || null),
  gender: optText(40),
  dateOfBirth: optDate,
  personalEmail: optEmail,
  workEmail: optEmail,
  personalPhone: phone,
  emergencyName: optText(160),
  emergencyPhone: phone,
  emergencyRelation: optText(60),
  departmentId: optId,
  teamId: optId,
  designation: optText(120),
  jobTitle: optText(160),
  employmentType: z.enum(EMPLOYMENT_TYPES),
  status: z.enum(EMPLOYMENT_STATUSES),
  joiningDate: optDate,
  probationStart: optDate,
  probationEnd: optDate,
  exitDate: optDate,
  managerId: optId,
  officeId: optId,
  workMode: z.enum(WORK_MODES),
  shiftId: optId,
  timezone: tz,
  workingDays: days,
  userId: optId,
});

async function nextEmployeeCode(tx: Prisma.TransactionClient) {
  const [row] = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO "Counter" ("key", "value") VALUES ('employee', 1)
    ON CONFLICT ("key") DO UPDATE SET "value" = "Counter"."value" + 1
    RETURNING "value"`;
  return `SHV-E-${String(row.value).padStart(4, "0")}`;
}

/** Sensitive fields are logged by name only, never by value. */
const changedFields = (before: Record<string, unknown>, after: Record<string, unknown>) =>
  Object.keys(after).filter((k) => JSON.stringify(before[k] ?? null) !== JSON.stringify(after[k] ?? null));

export async function saveEmployeeAction(id: string | null, _: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorize("employees:manage");
    const d = employeeSchema.parse(formObject(form));
    if (d.probationStart && d.probationEnd && d.probationEnd < d.probationStart) throw new UserError("Probation end is before its start.");
    if (id && d.managerId === id) throw new UserError("An employee cannot report to themselves.");
    if (d.managerId && id) {
      // Prevent reporting-line cycles.
      let cur: string | null = d.managerId;
      for (let i = 0; cur && i < 20; i++) {
        if (cur === id) throw new UserError("That manager reports to this employee (circular reporting line).");
        cur = (await db.employee.findUnique({ where: { id: cur }, select: { managerId: true } }))?.managerId ?? null;
      }
    }
    if (d.userId) {
      const linked = await db.employee.findFirst({ where: { userId: d.userId, NOT: id ? { id } : undefined }, select: { fullName: true } });
      if (linked) throw new UserError(`That login is already linked to ${linked.fullName}.`);
    }
    const data = { ...d, workingDays: d.workingDays.length ? d.workingDays : [1, 2, 3, 4, 5] };
    if (id) {
      const before = await db.employee.findUnique({ where: { id } });
      if (!before) throw new UserError("Employee not found.");
      await db.employee.update({ where: { id }, data });
      await audit({ userId: user.id, action: "employee.edited", entity: "Employee", entityId: id, metadata: { fields: changedFields(before as unknown as Record<string, unknown>, data) } });
      revalidatePath(`/admin/employees/${id}`);
      return { ok: "Employee saved." };
    }
    const created = await db.$transaction(async (tx) => tx.employee.create({ data: { ...data, employeeCode: await nextEmployeeCode(tx), createdById: user.id } }));
    await audit({ userId: user.id, action: "employee.created", entity: "Employee", entityId: created.id, metadata: { code: created.employeeCode } });
    return { ok: `Employee ${created.employeeCode} created.`, redirect: `/admin/employees/${created.id}` };
  } catch (e) {
    return fail(e, "employees");
  }
}

export async function archiveEmployeeAction(id: string, archive: boolean, _s?: ActionState, _f?: FormData): Promise<ActionState> {
  try {
    const user = await authorize("employees:archive");
    await db.employee.update({ where: { id }, data: { archivedAt: archive ? new Date() : null } });
    await audit({ userId: user.id, action: archive ? "employee.archived" : "employee.restored", entity: "Employee", entityId: id });
    return okThen(`/admin/employees/${id}`, archive ? "Employee archived." : "Employee restored.");
  } catch (e) {
    return fail(e, "employees");
  }
}

export async function bulkEmployeesAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorize("employees:manage");
    const ids = form.getAll("ids").map(String).filter(Boolean).slice(0, 500);
    if (!ids.length) throw new UserError("Select at least one employee.");
    const op = String(form.get("op") ?? "");
    const data: Prisma.EmployeeUpdateManyMutationInput & { departmentId?: string; officeId?: string; shiftId?: string } = {};
    if (op === "status") data.status = z.enum(EMPLOYMENT_STATUSES).parse(form.get("value"));
    else if (op === "workMode") data.workMode = z.enum(WORK_MODES).parse(form.get("value"));
    else if (op === "department") data.departmentId = z.string().min(1).max(40).parse(form.get("value"));
    else if (op === "office") data.officeId = z.string().min(1).max(40).parse(form.get("value"));
    else if (op === "shift") data.shiftId = z.string().min(1).max(40).parse(form.get("value"));
    else throw new UserError("Choose a bulk action.");
    const r = await db.employee.updateMany({ where: { id: { in: ids } }, data });
    await audit({ userId: user.id, action: "employee.bulk", metadata: { op, count: r.count } });
    return okThen("/admin/employees", `Updated ${r.count} employee(s).`);
  } catch (e) {
    return fail(e, "employees");
  }
}

/* ───────── compensation (permission-restricted, audited) ───────── */

const compSchema = z.object({
  salary: moneyStr(true),
  salaryType: z.enum(["ANNUAL", "MONTHLY", "HOURLY", "DAILY"]),
  currency,
  payFrequency: z.enum(["MONTHLY", "BIWEEKLY", "WEEKLY"]),
  bonus: moneyStr(),
  commission: optText(200),
  joiningBonus: moneyStr(),
  effectiveFrom: optDate.refine((v) => !!v, "Required"),
  notes: optText(500),
});

export async function addCompensationAction(employeeId: string, _: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorize("compensation:manage");
    const d = compSchema.parse(formObject(form));
    await db.employeeCompensation.create({ data: { employeeId, salary: d.salary!, salaryType: d.salaryType, currency: d.currency, payFrequency: d.payFrequency, bonus: d.bonus, commission: d.commission, joiningBonus: d.joiningBonus, effectiveFrom: d.effectiveFrom!, notes: d.notes, createdById: user.id } });
    await audit({ userId: user.id, action: "employee.compensation.changed", entity: "Employee", entityId: employeeId, metadata: { effectiveFrom: d.effectiveFrom } });
    revalidatePath(`/admin/employees/${employeeId}`);
    return { ok: "Compensation recorded." };
  } catch (e) {
    return fail(e, "employees");
  }
}

/* ───────── documents ───────── */

export async function uploadEmployeeDocumentAction(employeeId: string, _: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorize("employeeDocs:manage");
    await assertEmployeeAccess(user, employeeId, "view");
    const file = form.get("file");
    const kind = z.enum(Object.keys(HR_DOC_KINDS) as [keyof typeof HR_DOC_KINDS]).parse(form.get("kind"));
    if (!(file instanceof File) || !file.size) throw new UserError("Choose a file.");
    if (file.size > MAX_DOCUMENT_BYTES) throw new UserError("Files must be 4 MB or smaller.");
    const buf = Buffer.from(await file.arrayBuffer());
    const t = sniffDocument(buf, file.name);
    if (!t || !HR_DOC_TYPES.includes(t.mime)) throw new UserError("Upload a PDF, PNG, JPEG, WebP or DOCX file.");
    const storageKey = await storeHrDocument(buf, t.mime, t.ext).catch((e: Error) => {
      if (e.message === "STORAGE_NOT_CONFIGURED") throw new UserError("File storage is not configured (set BLOB_READ_WRITE_TOKEN).");
      throw e;
    });
    const name = safeName(String(form.get("name") || file.name));
    const doc = await db.employeeDocument.create({ data: { employeeId, kind, name, storageKey, mimeType: t.mime, size: buf.length, employeeVisible: form.get("employeeVisible") === "on", uploadedById: user.id } });
    await audit({ userId: user.id, action: "employee.document.uploaded", entity: "EmployeeDocument", entityId: doc.id, metadata: { employeeId, kind } });
    revalidatePath(`/admin/employees/${employeeId}`);
    return { ok: "Document uploaded." };
  } catch (e) {
    return fail(e, "employees");
  }
}

export async function deleteEmployeeDocumentAction(id: string, _s?: ActionState, _f?: FormData): Promise<ActionState> {
  try {
    const user = await authorize("employeeDocs:manage");
    const doc = await db.employeeDocument.findUnique({ where: { id } });
    if (!doc) throw new UserError("Document not found.");
    await db.employeeDocument.delete({ where: { id } });
    await deleteHrDocument(doc.storageKey);
    await audit({ userId: user.id, action: "employee.document.deleted", entity: "EmployeeDocument", entityId: id, metadata: { employeeId: doc.employeeId, kind: doc.kind } });
    return okThen(`/admin/employees/${doc.employeeId}?tab=documents`, "Document deleted.");
  } catch (e) {
    return fail(e, "employees");
  }
}

/* ───────── organisation: departments, teams, offices, shifts ───────── */

export async function saveDepartmentAction(id: string | null, _: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorize("employees:manage");
    const d = z.object({ name: reqText(120), code: optText(20), headId: optId, active: z.preprocess((v) => v === "on", z.boolean()) }).parse({ ...formObject(form), active: form.get("active") ?? (id ? undefined : "on") });
    const row = id ? await db.department.update({ where: { id }, data: d }) : await db.department.create({ data: d });
    await audit({ userId: user.id, action: id ? "department.updated" : "department.created", entity: "Department", entityId: row.id });
    return okThen("/admin/employees/departments", "Department saved.");
  } catch (e) {
    return fail(e, "employees");
  }
}

export async function saveTeamAction(id: string | null, _: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorize("employees:manage");
    const d = z.object({ name: reqText(120), departmentId: optId, leadId: optId }).parse(formObject(form));
    const row = id ? await db.team.update({ where: { id }, data: d }) : await db.team.create({ data: d });
    await audit({ userId: user.id, action: id ? "team.updated" : "team.created", entity: "Team", entityId: row.id });
    return okThen("/admin/employees/departments", "Team saved.");
  } catch (e) {
    return fail(e, "employees");
  }
}

const coord = (max: number) => z.preprocess((v) => (v == null || v === "" ? null : Number(v)), z.number().min(-max).max(max).nullable());

export async function saveOfficeAction(id: string | null, _: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorize("attendance:manage");
    const d = z
      .object({ name: reqText(120), address: optText(300), latitude: coord(90), longitude: coord(180), radiusM: z.coerce.number().int().min(25).max(20_000), timezone: tz, remote: z.preprocess((v) => v === "on", z.boolean()), active: z.preprocess((v) => v === "on", z.boolean()) })
      .parse({ ...formObject(form), remote: form.get("remote"), active: form.get("active") });
    if (!d.remote && (d.latitude == null || d.longitude == null)) throw new UserError("An office needs latitude and longitude for its geofence (or mark it Remote).");
    const data = { ...d, timezone: d.timezone ?? "Asia/Kolkata", latitude: d.latitude?.toFixed(6) ?? null, longitude: d.longitude?.toFixed(6) ?? null };
    const row = id ? await db.officeLocation.update({ where: { id }, data }) : await db.officeLocation.create({ data });
    await audit({ userId: user.id, action: id ? "office.updated" : "office.created", entity: "OfficeLocation", entityId: row.id, metadata: { radiusM: d.radiusM, active: d.active } });
    return okThen("/admin/settings/offices", "Office saved.");
  } catch (e) {
    return fail(e, "offices");
  }
}

export async function saveShiftAction(id: string | null, _: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorize("attendance:manage");
    const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM");
    const d = z
      .object({ name: reqText(80), startTime: hhmm, endTime: hhmm, graceMinutes: z.coerce.number().int().min(0).max(240), breakMinutes: z.coerce.number().int().min(0).max(480), weekDays: days, timezone: tz, officeId: optId, remoteEligible: z.preprocess((v) => v === "on", z.boolean()) })
      .parse({ ...formObject(form), remoteEligible: form.get("remoteEligible") });
    if (!d.weekDays.length) throw new UserError("Choose at least one working day.");
    const data = { ...d, timezone: d.timezone ?? "Asia/Kolkata" };
    const row = id ? await db.shift.update({ where: { id }, data }) : await db.shift.create({ data });
    await audit({ userId: user.id, action: id ? "shift.updated" : "shift.created", entity: "Shift", entityId: row.id });
    return okThen("/admin/employees/shifts", "Shift saved.");
  } catch (e) {
    return fail(e, "shifts");
  }
}

/** Link an existing login to an employee from the Users page flow (HR only). */
export async function linkLoginAction(employeeId: string, _: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorize("employees:manage");
    if (!can(user.role, "users:manage")) throw new UserError("Linking logins also needs user-management permission.");
    const userId = optId.parse(form.get("userId"));
    await db.employee.update({ where: { id: employeeId }, data: { userId } });
    await audit({ userId: user.id, action: "employee.login.linked", entity: "Employee", entityId: employeeId, metadata: { userId } });
    revalidatePath(`/admin/employees/${employeeId}`);
    return { ok: userId ? "Login linked." : "Login unlinked." };
  } catch (e) {
    return fail(e, "employees");
  }
}
