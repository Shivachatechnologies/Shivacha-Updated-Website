import "server-only";
import { db } from "@/lib/db/client";
import type { Prisma } from "@/lib/generated/prisma/client";
import { audit } from "@/lib/audit";
import { requestMeta } from "@/lib/auth/session";
import { parseUserAgent } from "@/lib/os/ua";
import { evaluateGeofence, validCoords, type Coords, type GeofenceResult } from "./geo";
import { needsLocation, type WorkforcePolicy } from "./policy";
import { getWorkforcePolicy } from "./settings";
import { DEFAULT_TZ, isEarlyCheckout, lateMinutes, minutesBetween, safeTz, workDate } from "./time";

export const PUNCHES = ["CHECK_IN", "BREAK_START", "BREAK_END", "CHECK_OUT"] as const;
export type Punch = (typeof PUNCHES)[number];
export const METHODS = ["WEB", "MOBILE", "QR", "ADMIN_OVERRIDE"] as const;
export type PunchMethod = (typeof METHODS)[number];

export class AttendanceError extends Error {}

const employeeInclude = { shift: true, office: true } as const;
type Emp = Prisma.EmployeeGetPayload<{ include: typeof employeeInclude }>;

export const employeeTz = (e: { timezone: string | null; shift: { timezone: string } | null; office: { timezone: string } | null }) => safeTz(e.timezone ?? e.shift?.timezone ?? e.office?.timezone ?? DEFAULT_TZ);

const num = (v: { toString(): string } | null | undefined) => (v == null ? null : Number(v.toString()));
const officeGeo = (o: Emp["office"]) => (o ? { id: o.id, name: o.name, latitude: num(o.latitude), longitude: num(o.longitude), radiusM: o.radiusM, remote: o.remote } : null);

export interface PunchInput {
  employeeId: string;
  action: Punch;
  method?: PunchMethod;
  coords?: Coords | null;
  /** The browser refused or could not provide a location. */
  locationDenied?: boolean;
  /** Hybrid employees choose where they work today. */
  workMode?: "OFFICE" | "REMOTE";
  actorId: string;
  note?: string;
  now?: Date;
}

export interface PunchResult {
  ok: true;
  status: string;
  message: string;
  geofence: GeofenceResult | null;
  distanceM: number | null;
}

/** Decides whether a location is required and whether the check-in passes the geofence (pure; exported for tests). */
export function evaluateCheckIn(policy: WorkforcePolicy, mode: "OFFICE" | "REMOTE" | "HYBRID", chosen: "OFFICE" | "REMOTE" | undefined, office: ReturnType<typeof officeGeo>, coords: Coords | null | undefined, denied: boolean) {
  const effective: "OFFICE" | "REMOTE" = mode === "HYBRID" ? (chosen ?? "OFFICE") : mode;
  if (!needsLocation(policy, effective)) return { allowed: true, effective, geofence: "NOT_REQUIRED" as GeofenceResult, distanceM: null as number | null, message: "Checked in successfully." };
  const pos = validCoords(coords) ? coords : null;
  if (effective === "REMOTE") return { allowed: true, effective, geofence: (pos ? "NOT_REQUIRED" : "NO_LOCATION") as GeofenceResult, distanceM: null, message: "Checked in successfully (remote)." };
  const g = evaluateGeofence(pos, office);
  if (g.result === "NOT_REQUIRED") return { allowed: true, effective, geofence: g.result, distanceM: null, message: "Checked in successfully." };
  if (g.result === "NO_LOCATION") {
    if (policy.geofenceEnforcement === "BLOCK") return { allowed: false, effective, geofence: g.result, distanceM: null, message: denied ? "Location permission is required to check in at the office. Allow location access or ask your manager for an override." : "Your location could not be determined. Try again, or ask your manager for an override." };
    return { allowed: true, effective, geofence: g.result, distanceM: null, message: "Checked in without a location — flagged for review." };
  }
  if (g.result === "OUTSIDE") {
    if (policy.geofenceEnforcement === "BLOCK") return { allowed: false, effective, geofence: g.result, distanceM: g.distanceM, message: `You are outside the authorized office area (${g.distanceM} m from ${office?.name}).` };
    return { allowed: true, effective, geofence: g.result, distanceM: g.distanceM, message: `Checked in — you are outside the office area (${g.distanceM} m away), so this check-in is flagged for review.` };
  }
  return { allowed: true, effective, geofence: g.result, distanceM: g.distanceM, message: "Checked in successfully." };
}

/** Records a check-in, break or check-out. Every punch is an immutable AttendanceEvent plus the rolled-up day. */
export async function punch(input: PunchInput): Promise<PunchResult> {
  const now = input.now ?? new Date();
  const emp = await db.employee.findUnique({ where: { id: input.employeeId }, include: employeeInclude });
  if (!emp || emp.archivedAt) throw new AttendanceError("Employee record not found.");
  if (["RESIGNED", "TERMINATED", "INACTIVE", "SUSPENDED"].includes(emp.status)) throw new AttendanceError("Attendance is not available for this employment status.");
  const policy = await getWorkforcePolicy();
  const tz = employeeTz(emp);
  const date = workDate(now, tz);
  const day = await db.attendanceDay.upsert({ where: { employeeId_date: { employeeId: emp.id, date } }, update: {}, create: { employeeId: emp.id, date, status: "NOT_CHECKED_IN" } });
  const meta = await requestMeta().catch(() => ({ ip: null, userAgent: null }));
  const ua = parseUserAgent(meta.userAgent);
  const method = input.method ?? (ua.device === "Mobile" ? "MOBILE" : "WEB");

  let geofence: GeofenceResult | null = null;
  let distance: number | null = null;
  let message = "";
  let data: Prisma.AttendanceDayUpdateInput = { lastActivityAt: now };

  switch (input.action) {
    case "CHECK_IN": {
      if (day.checkInAt) throw new AttendanceError(day.checkOutAt ? "You have already checked out today." : "You are already checked in.");
      if (day.status === "ON_LEAVE") throw new AttendanceError("You are on approved leave today.");
      const check = input.method === "ADMIN_OVERRIDE" ? { allowed: true, effective: (input.workMode ?? (emp.workMode === "REMOTE" ? "REMOTE" : "OFFICE")) as "OFFICE" | "REMOTE", geofence: "NOT_REQUIRED" as GeofenceResult, distanceM: null, message: "Checked in by override." } : evaluateCheckIn(policy, emp.workMode, input.workMode, officeGeo(emp.office), input.coords, !!input.locationDenied);
      geofence = check.geofence;
      distance = check.distanceM;
      message = check.message;
      if (!check.allowed) {
        await audit({ userId: input.actorId, action: "attendance.checkin.refused", entity: "Employee", entityId: emp.id, metadata: { geofence, distanceM: distance } });
        throw new AttendanceError(message);
      }
      const late = lateMinutes(now, emp.shift);
      data = { ...data, status: "WORKING", checkInAt: now, lateMinutes: late, workMode: check.effective, office: emp.office && check.effective === "OFFICE" ? { connect: { id: emp.office.id } } : undefined, geofence, source: method };
      if (late) message += ` You are ${late} min late.`;
      break;
    }
    case "BREAK_START":
      if (day.status !== "WORKING" && day.status !== "AWAY") throw new AttendanceError("Start a break only while checked in.");
      data = { ...data, status: "ON_BREAK" };
      message = "Break started.";
      break;
    case "BREAK_END": {
      if (day.status !== "ON_BREAK") throw new AttendanceError("You are not on a break.");
      const start = await db.attendanceEvent.findFirst({ where: { dayId: day.id, type: "BREAK_START" }, orderBy: { at: "desc" } });
      data = { ...data, status: "WORKING", breakMinutes: day.breakMinutes + (start ? minutesBetween(start.at, now) : 0) };
      message = "Welcome back.";
      break;
    }
    case "CHECK_OUT": {
      if (!day.checkInAt || day.checkOutAt) throw new AttendanceError(day.checkOutAt ? "You have already checked out." : "You have not checked in today.");
      let breaks = day.breakMinutes;
      if (day.status === "ON_BREAK") {
        const start = await db.attendanceEvent.findFirst({ where: { dayId: day.id, type: "BREAK_START" }, orderBy: { at: "desc" } });
        if (start) breaks += minutesBetween(start.at, now);
      }
      const work = Math.max(0, minutesBetween(day.checkInAt, now) - breaks);
      const early = isEarlyCheckout(now, emp.shift);
      if (input.method !== "ADMIN_OVERRIDE" && needsLocation(policy, day.workMode ?? "OFFICE") && day.workMode === "OFFICE") {
        const g = evaluateGeofence(validCoords(input.coords) ? input.coords : null, officeGeo(emp.office));
        geofence = g.result;
        distance = g.distanceM;
      }
      data = { ...data, status: "CHECKED_OUT", checkOutAt: now, breakMinutes: breaks, workMinutes: work, earlyCheckout: early, halfDay: work > 0 && work < 240 };
      message = `Checked out. Worked ${Math.floor(work / 60)}h ${work % 60}m.${early ? " Early checkout recorded." : ""}`;
      break;
    }
  }

  const c = validCoords(input.coords) ? input.coords : null;
  await db.$transaction([
    db.attendanceDay.update({ where: { id: day.id }, data }),
    db.attendanceEvent.create({
      data: {
        employeeId: emp.id,
        dayId: day.id,
        type: input.action,
        at: now,
        method,
        ip: meta.ip,
        device: ua.device,
        browser: ua.browser,
        os: ua.os,
        // Coordinates are stored only when the policy collects location.
        latitude: c && policy.locationPolicy !== "NONE" ? c.latitude.toFixed(6) : null,
        longitude: c && policy.locationPolicy !== "NONE" ? c.longitude.toFixed(6) : null,
        accuracyM: c && policy.locationPolicy !== "NONE" && c.accuracy != null ? Math.round(c.accuracy) : null,
        distanceM: distance,
        geofence,
        actorId: input.actorId,
        note: input.note?.slice(0, 300),
      },
    }),
  ]);
  await audit({ userId: input.actorId, action: `attendance.${input.action.toLowerCase()}`, entity: "Employee", entityId: emp.id, metadata: { method, geofence, distanceM: distance, override: input.method === "ADMIN_OVERRIDE" } });
  return { ok: true, status: String(data.status ?? day.status), message: message.trim(), geofence, distanceM: distance };
}

/** Periodic work-location update (PERIODIC policy, while checked in). */
export async function recordLocationPing(employeeId: string, coords: Coords, now = new Date()) {
  const policy = await getWorkforcePolicy();
  if (policy.locationPolicy !== "PERIODIC") throw new AttendanceError("Periodic location sharing is switched off.");
  if (!validCoords(coords)) throw new AttendanceError("Invalid location.");
  const emp = await db.employee.findUnique({ where: { id: employeeId }, include: employeeInclude });
  if (!emp) throw new AttendanceError("Employee record not found.");
  const day = await db.attendanceDay.findUnique({ where: { employeeId_date: { employeeId, date: workDate(now, employeeTz(emp)) } } });
  if (!day || !["WORKING", "ON_BREAK", "AWAY"].includes(day.status)) throw new AttendanceError("Location is shared only while you are checked in.");
  const last = await db.locationPing.findFirst({ where: { employeeId }, orderBy: { at: "desc" }, select: { at: true } });
  if (last && now.getTime() - last.at.getTime() < (policy.periodicMinutes * 60_000) / 2) return { skipped: true };
  const g = day.workMode === "OFFICE" ? evaluateGeofence(coords, officeGeo(emp.office)) : { result: "NOT_REQUIRED" as GeofenceResult, distanceM: null };
  await db.$transaction([
    db.locationPing.create({ data: { employeeId, at: now, latitude: coords.latitude.toFixed(6), longitude: coords.longitude.toFixed(6), accuracyM: coords.accuracy != null ? Math.round(coords.accuracy) : null, distanceM: g.distanceM, geofence: g.result } }),
    db.attendanceDay.update({ where: { id: day.id }, data: { lastActivityAt: now, status: day.status === "AWAY" ? "WORKING" : undefined } }),
  ]);
  return { skipped: false, geofence: g.result };
}

/* ───────────────────────── live state ───────────────────────── */

export type LiveState = "WORKING" | "ON_BREAK" | "AWAY" | "CHECKED_OUT" | "ON_LEAVE" | "HOLIDAY" | "NOT_CHECKED_IN" | "ABSENT" | "OFF_DAY";

export interface LiveRow {
  id: string;
  code: string;
  name: string;
  photoUrl: string | null;
  department: string | null;
  workMode: string;
  state: LiveState;
  late: number;
  checkInAt: Date | null;
  checkOutAt: Date | null;
  workedMinutes: number;
  dayWorkMode: string | null;
  office: string | null;
  geofence: string | null;
  lastActivityAt: Date | null;
  lastLocationAt: Date | null;
  lastLocationAccuracy: number | null;
  lastLat: number | null;
  lastLng: number | null;
}

/** Today's real attendance state for a set of employees (each evaluated in their own time zone). */
export async function liveWorkforce(where: Prisma.EmployeeWhereInput, now = new Date()): Promise<LiveRow[]> {
  const policy = await getWorkforcePolicy();
  const emps = await db.employee.findMany({
    where: { ...where, archivedAt: null, status: { in: ["ACTIVE", "PROBATION", "NOTICE_PERIOD", "ON_LEAVE"] } },
    include: { shift: true, office: true, department: { select: { name: true } } },
    orderBy: { fullName: "asc" },
    take: 1000,
  });
  if (!emps.length) return [];
  const dates = new Map(emps.map((e) => [e.id, workDate(now, employeeTz(e))]));
  const uniq = [...new Set([...dates.values()].map((d) => d.getTime()))].map((t) => new Date(t));
  const [days, leaves, holidays, pings] = await Promise.all([
    db.attendanceDay.findMany({ where: { employeeId: { in: emps.map((e) => e.id) }, date: { in: uniq } } }),
    db.leaveRequest.findMany({ where: { employeeId: { in: emps.map((e) => e.id) }, status: "APPROVED", startDate: { lte: uniq.reduce((a, b) => (a > b ? a : b)) }, endDate: { gte: uniq.reduce((a, b) => (a < b ? a : b)) } }, select: { employeeId: true, startDate: true, endDate: true } }),
    db.holiday.findMany({ where: { date: { in: uniq } }, select: { date: true, officeId: true } }),
    policy.locationPolicy === "NONE" ? Promise.resolve([]) : db.locationPing.findMany({ where: { employeeId: { in: emps.map((e) => e.id) }, at: { gte: new Date(now.getTime() - 12 * 3600_000) } }, orderBy: { at: "desc" }, distinct: ["employeeId"] }),
  ]);
  const dayOf = new Map(days.map((d) => [`${d.employeeId}|${d.date.getTime()}`, d]));
  const pingOf = new Map(pings.map((p) => [p.employeeId, p]));
  return emps.map((e) => {
    const date = dates.get(e.id)!;
    const d = dayOf.get(`${e.id}|${date.getTime()}`);
    const weekday = date.getUTCDay() === 0 ? 7 : date.getUTCDay();
    const workingDays = e.shift?.weekDays ?? e.workingDays;
    const onLeave = leaves.some((l) => l.employeeId === e.id && l.startDate <= date && l.endDate >= date);
    const holiday = holidays.some((h) => h.date.getTime() === date.getTime() && (!h.officeId || h.officeId === e.officeId));
    let state: LiveState;
    if (d?.checkInAt && !d.checkOutAt) {
      const idle = d.lastActivityAt ? now.getTime() - d.lastActivityAt.getTime() : 0;
      state = d.status === "ON_BREAK" ? "ON_BREAK" : d.status === "AWAY" || idle > policy.awayAfterMinutes * 60_000 ? "AWAY" : "WORKING";
    } else if (d?.checkOutAt) state = "CHECKED_OUT";
    else if (onLeave || d?.status === "ON_LEAVE") state = "ON_LEAVE";
    else if (holiday) state = "HOLIDAY";
    else if (!workingDays.includes(weekday)) state = "OFF_DAY";
    else if (d?.status === "ABSENT") state = "ABSENT";
    else {
      // Absent only once the scheduled start (plus grace) has passed; before that the person simply has not checked in yet.
      const start = e.shift ? lateMinutes(now, e.shift) > 0 : false;
      state = start ? "ABSENT" : "NOT_CHECKED_IN";
    }
    const p = pingOf.get(e.id);
    const worked = d?.checkInAt ? (d.checkOutAt ? d.workMinutes : Math.max(0, minutesBetween(d.checkInAt, now) - d.breakMinutes)) : 0;
    return {
      id: e.id,
      code: e.employeeCode,
      name: e.fullName,
      photoUrl: e.photoUrl,
      department: e.department?.name ?? null,
      workMode: e.workMode,
      state,
      late: d?.lateMinutes ?? 0,
      checkInAt: d?.checkInAt ?? null,
      checkOutAt: d?.checkOutAt ?? null,
      workedMinutes: worked,
      dayWorkMode: d?.workMode ?? null,
      office: e.office?.name ?? null,
      geofence: d?.geofence ?? null,
      lastActivityAt: d?.lastActivityAt ?? null,
      lastLocationAt: p?.at ?? null,
      lastLocationAccuracy: p?.accuracyM ?? null,
      lastLat: p ? Number(p.latitude) : null,
      lastLng: p ? Number(p.longitude) : null,
    };
  });
}

export function summarize(rows: LiveRow[]) {
  const count = (f: (r: LiveRow) => boolean) => rows.filter(f).length;
  const present = (r: LiveRow) => !!r.checkInAt;
  return {
    total: rows.length,
    present: count(present),
    working: count((r) => r.state === "WORKING"),
    onBreak: count((r) => r.state === "ON_BREAK"),
    away: count((r) => r.state === "AWAY"),
    checkedOut: count((r) => r.state === "CHECKED_OUT"),
    absent: count((r) => r.state === "ABSENT"),
    notYet: count((r) => r.state === "NOT_CHECKED_IN"),
    onLeave: count((r) => r.state === "ON_LEAVE"),
    late: count((r) => r.late > 0),
    remote: count((r) => present(r) && r.dayWorkMode === "REMOTE"),
    office: count((r) => present(r) && r.dayWorkMode === "OFFICE"),
    outsideGeofence: count((r) => r.geofence === "OUTSIDE" || r.geofence === "NO_LOCATION"),
  };
}

/** Daily job: materialise yesterday's no-shows as ABSENT (never invents a check-in) and purge expired location data. */
export async function attendanceDailyJob(now = new Date()) {
  const policy = await getWorkforcePolicy();
  const yesterday = new Date(now.getTime() - 86_400_000);
  const rows = await liveWorkforce({}, yesterday);
  const absent = rows.filter((r) => r.state === "ABSENT" || r.state === "NOT_CHECKED_IN");
  let marked = 0;
  for (const r of absent) {
    const emp = await db.employee.findUnique({ where: { id: r.id }, include: employeeInclude });
    if (!emp) continue;
    const date = workDate(yesterday, employeeTz(emp));
    const res = await db.attendanceDay.upsert({ where: { employeeId_date: { employeeId: r.id, date } }, update: {}, create: { employeeId: r.id, date, status: "ABSENT", source: "SYSTEM" } });
    if (res.status === "NOT_CHECKED_IN" && !res.checkInAt) await db.attendanceDay.update({ where: { id: res.id }, data: { status: "ABSENT", source: "SYSTEM" } });
    marked++;
  }
  let purged = 0;
  if (policy.locationRetentionDays) {
    const cutoff = new Date(now.getTime() - policy.locationRetentionDays * 86_400_000);
    purged = (await db.locationPing.deleteMany({ where: { at: { lt: cutoff } } })).count;
    await db.attendanceEvent.updateMany({ where: { at: { lt: cutoff }, latitude: { not: null } }, data: { latitude: null, longitude: null, accuracyM: null } });
  }
  return { absentMarked: marked, locationPointsPurged: purged };
}
