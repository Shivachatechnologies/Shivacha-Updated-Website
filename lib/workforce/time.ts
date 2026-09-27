/** Work-time helpers (pure). Dates for attendance/leave are local calendar dates stored as 00:00 UTC. */

export const DEFAULT_TZ = "Asia/Kolkata";

export function safeTz(tz: string | null | undefined) {
  if (!tz) return DEFAULT_TZ;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return DEFAULT_TZ;
  }
}

/** Wall-clock parts of `d` in `tz`. */
export function zonedParts(d: Date, tz: string) {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: safeTz(tz), year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23" });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  const iso = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[p.weekday as "Mon"] ?? 1;
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day), hour: Number(p.hour), minute: Number(p.minute), weekday: iso };
}

/** The local work date for `d` in `tz`, as a Date at 00:00 UTC (matches @db.Date columns). */
export function workDate(d: Date, tz: string) {
  const p = zonedParts(d, tz);
  return new Date(Date.UTC(p.y, p.m - 1, p.d));
}

export const dateKey = (d: Date) => d.toISOString().slice(0, 10);

export function parseHHMM(v: string | null | undefined): number | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(v ?? "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** Minutes after the shift start (+ grace) that a check-in at `at` represents; 0 when on time or no shift. */
export function lateMinutes(at: Date, shift: { startTime: string; graceMinutes: number; timezone: string } | null) {
  const start = parseHHMM(shift?.startTime);
  if (!shift || start == null) return 0;
  const p = zonedParts(at, shift.timezone);
  const mins = p.hour * 60 + p.minute - start;
  return mins > shift.graceMinutes ? mins : 0;
}

/** True when checking out before the shift end (overnight shifts are not treated as early). */
export function isEarlyCheckout(at: Date, shift: { startTime: string; endTime: string; timezone: string } | null) {
  const start = parseHHMM(shift?.startTime);
  const end = parseHHMM(shift?.endTime);
  if (!shift || start == null || end == null || end <= start) return false;
  const p = zonedParts(at, shift.timezone);
  return p.hour * 60 + p.minute < end;
}

/** Working days between two dates inclusive, excluding non-working weekdays and holidays. Half day = 0.5. */
export function leaveDays(start: Date, end: Date, workingDays: number[], holidays: Set<string>, halfDay = false) {
  if (end < start) return 0;
  let n = 0;
  for (let t = start.getTime(); t <= end.getTime(); t += 86_400_000) {
    const d = new Date(t);
    const iso = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
    if (workingDays.includes(iso) && !holidays.has(dateKey(d))) n++;
  }
  if (halfDay) return n >= 1 ? 0.5 : 0;
  return n;
}

export const minutesBetween = (a: Date, b: Date) => Math.max(0, Math.round((b.getTime() - a.getTime()) / 60_000));

export const fmtMinutes = (m: number | null | undefined) => {
  if (m == null) return "—";
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h ? `${h}h ${String(r).padStart(2, "0")}m` : `${r}m`;
};
