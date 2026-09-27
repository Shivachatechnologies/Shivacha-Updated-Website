"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { audit } from "@/lib/audit";
import { authorize } from "@/lib/auth/session";
import { fail, formObject, okThen, UserError, type ActionState } from "@/lib/os/action";
import { rateLimited } from "@/lib/os/ratelimit";
import { myEmployee } from "./access";
import { AttendanceError, employeeTz, punch, PUNCHES, recordLocationPing } from "./attendance";
import { workforceSchema } from "./policy";
import { workDate } from "./time";

const coordsSchema = z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180), accuracy: z.number().min(0).max(100_000).nullable().optional() }).nullable().optional();
const punchSchema = z.object({ action: z.enum(PUNCHES), coords: coordsSchema, locationDenied: z.boolean().optional(), workMode: z.enum(["OFFICE", "REMOTE"]).optional(), method: z.enum(["WEB", "MOBILE", "QR"]).optional() });

export type PunchState = { ok?: string; error?: string; geofence?: string | null; distanceM?: number | null };

/** Self-service check-in / break / check-out for the signed-in employee. */
export async function punchAction(input: z.input<typeof punchSchema>): Promise<PunchState> {
  try {
    const user = await authorize("selfservice:use");
    if (rateLimited(`punch:${user.id}`, 20, 60_000)) throw new UserError("Too many attempts. Wait a minute and try again.");
    const d = punchSchema.parse(input);
    const me = await myEmployee(user.id);
    if (!me) throw new UserError("Your login is not linked to an employee record. Ask HR to link it.");
    const r = await punch({ employeeId: me.id, action: d.action, coords: d.coords ?? null, locationDenied: d.locationDenied, workMode: d.workMode, method: d.method, actorId: user.id });
    revalidatePath("/employee");
    return { ok: r.message, geofence: r.geofence, distanceM: r.distanceM };
  } catch (e) {
    if (e instanceof AttendanceError) return { error: e.message };
    const r = fail(e, "attendance");
    return { error: r?.error };
  }
}

export async function locationPingAction(input: { latitude: number; longitude: number; accuracy?: number | null }): Promise<PunchState> {
  try {
    const user = await authorize("selfservice:use");
    if (rateLimited(`ping:${user.id}`, 10, 60_000)) return { error: "Too many location updates." };
    const c = coordsSchema.parse(input);
    const me = await myEmployee(user.id);
    if (!me || !c) throw new UserError("No employee record.");
    const r = await recordLocationPing(me.id, c);
    return { ok: r.skipped ? "Skipped (too soon)." : "Location shared.", geofence: "geofence" in r ? r.geofence : null };
  } catch (e) {
    if (e instanceof AttendanceError) return { error: e.message };
    return { error: fail(e, "attendance")?.error };
  }
}

const overrideSchema = z.object({
  employeeId: z.string().min(1).max(40),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkIn: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional().or(z.literal("")),
  checkOut: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional().or(z.literal("")),
  status: z.enum(["WORKING", "CHECKED_OUT", "ABSENT", "HALF_DAY", "ON_LEAVE", "HOLIDAY"]).optional().or(z.literal("")),
  breakMinutes: z.coerce.number().int().min(0).max(600).default(0),
  reason: z.string().trim().min(3, "A reason is required for an override").max(300),
});

/** Converts a local "YYYY-MM-DD HH:MM" in `tz` to a UTC instant. */
function zonedToUtc(date: string, hhmm: string, tz: string) {
  const guess = new Date(`${date}T${hhmm}:00Z`);
  const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  const p = Object.fromEntries(f.formatToParts(guess).map((x) => [x.type, x.value]));
  const asLocal = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute));
  return new Date(guess.getTime() - (asLocal - guess.getTime()));
}

/** HR correction of a day. The original events are kept; the override is its own audited event. */
export async function overrideAttendanceAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorize("attendance:override");
    const d = overrideSchema.parse(formObject(form));
    const emp = await db.employee.findUnique({ where: { id: d.employeeId }, include: { shift: true, office: true } });
    if (!emp) throw new UserError("Employee not found.");
    const tz = employeeTz(emp);
    const date = new Date(`${d.date}T00:00:00Z`);
    const checkInAt = d.checkIn ? zonedToUtc(d.date, d.checkIn, tz) : null;
    const checkOutAt = d.checkOut ? zonedToUtc(d.date, d.checkOut, tz) : null;
    if (checkInAt && checkOutAt && checkOutAt <= checkInAt) throw new UserError("Check-out must be after check-in.");
    const work = checkInAt && checkOutAt ? Math.max(0, Math.round((checkOutAt.getTime() - checkInAt.getTime()) / 60_000) - d.breakMinutes) : 0;
    const status = d.status || (checkOutAt ? "CHECKED_OUT" : checkInAt ? "WORKING" : "ABSENT");
    const day = await db.attendanceDay.upsert({
      where: { employeeId_date: { employeeId: emp.id, date } },
      update: { status, checkInAt, checkOutAt, breakMinutes: d.breakMinutes, workMinutes: work, halfDay: status === "HALF_DAY", source: "ADMIN_OVERRIDE", note: d.reason },
      create: { employeeId: emp.id, date, status, checkInAt, checkOutAt, breakMinutes: d.breakMinutes, workMinutes: work, halfDay: status === "HALF_DAY", source: "ADMIN_OVERRIDE", note: d.reason, workMode: emp.workMode === "REMOTE" ? "REMOTE" : "OFFICE" },
    });
    await db.attendanceEvent.create({ data: { employeeId: emp.id, dayId: day.id, type: "OVERRIDE", method: "ADMIN_OVERRIDE", actorId: user.id, note: d.reason } });
    await audit({ userId: user.id, action: "attendance.overridden", entity: "Employee", entityId: emp.id, metadata: { date: d.date, status, reason: d.reason } });
    return okThen(`/admin/employees/${emp.id}?tab=attendance`, "Attendance updated.");
  } catch (e) {
    return fail(e, "attendance");
  }
}

export async function saveWorkforcePolicyAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorize("attendance:manage");
    const d = workforceSchema.parse({ ...formObject(form), remoteLocation: form.get("remoteLocation") });
    await db.setting.upsert({ where: { key: "workforce" }, update: { value: d }, create: { key: "workforce", value: d } });
    await audit({ userId: user.id, action: "workforce.policy.changed", metadata: d });
    return okThen("/admin/settings/workforce", "Workforce policy saved.");
  } catch (e) {
    return fail(e, "workforce");
  }
}

/** Today's work date for the signed-in employee (used by the portal clock). */
export async function myWorkDate() {
  const user = await authorize("selfservice:use");
  const me = await myEmployee(user.id);
  return me ? workDate(new Date(), employeeTz(me)).toISOString().slice(0, 10) : null;
}
