/** Verifies the footer world clock's time-zone maths, including US/UK daylight saving. */
import { WORLD_CLOCKS, zoneTime } from "../../components/layout/WorldClock";

const cases: [string, string, string, number, number][] = [
  // [UTC instant, zone, expected abbreviation, hour, minute]
  ["2026-01-15T12:00:00Z", "America/New_York", "EST", 7, 0],
  ["2026-07-15T12:00:00Z", "America/New_York", "EDT", 8, 0],
  ["2026-01-15T12:00:00Z", "Europe/London", "GMT", 12, 0],
  ["2026-07-15T12:00:00Z", "Europe/London", "BST", 13, 0],
  ["2026-03-08T06:59:00Z", "America/New_York", "EST", 1, 59], // just before US spring-forward
  ["2026-03-08T07:00:00Z", "America/New_York", "EDT", 3, 0], // just after
  ["2026-10-25T00:59:00Z", "Europe/London", "BST", 1, 59], // just before UK fall-back
  ["2026-10-25T01:00:00Z", "Europe/London", "GMT", 1, 0], // just after
  ["2026-07-15T12:00:00Z", "Asia/Kolkata", "IST", 17, 30],
  ["2026-07-15T12:00:00Z", "Asia/Dubai", "GST", 16, 0],
  ["2026-07-15T12:00:00Z", "Asia/Riyadh", "AST", 15, 0],
];
let failed = 0;
for (const [iso, tz, abbr, h, m] of cases) {
  const z = zoneTime(tz, Date.parse(iso));
  const ok = z.abbr === abbr && z.h === h && z.m === m;
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${tz} @ ${iso} → ${String(z.h).padStart(2, "0")}:${String(z.m).padStart(2, "0")} ${z.abbr} (expected ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")} ${abbr})`);
}
const zones = WORLD_CLOCKS.map((c) => c.timeZone).join(",");
if (zones !== "America/New_York,Europe/London,Asia/Kolkata,Asia/Dubai,Asia/Riyadh") {
  failed++;
  console.log("FAIL clock list: " + zones);
}
process.exit(failed ? 1 : 0);
