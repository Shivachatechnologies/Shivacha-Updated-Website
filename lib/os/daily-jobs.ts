import "server-only";
import { aiDailyJobs } from "@/lib/ai/scheduled";
import { isEnabled } from "@/lib/os/flags";
import { attendanceDailyJob } from "@/lib/workforce/attendance";
import { getVisitorPolicy } from "@/lib/visitors/settings";
import { visitorRetentionJob } from "@/lib/visitors/collect";
import { runGrowthLoop } from "@/lib/growth/loop";

/** Every module's daily job, run by the cron endpoint and the "Run now" button (all idempotent). */
export function allDailyJobs(): { name: string; run: () => Promise<number> }[] {
  return [
    ...aiDailyJobs(),
    { name: "workforce.attendance", run: async () => { const r = await attendanceDailyJob(); return r.absentMarked + r.locationPointsPurged; } },
    { name: "visitors.retention", run: async () => visitorRetentionJob(await getVisitorPolicy()) },
    // Growth department: does nothing unless AUTONOMOUS_GROWTH_MODE is on and no kill switch is set.
    { name: "growth.autonomous", run: async () => ((await isEnabled("GROWTH")) ? runGrowthLoop("SCHEDULE") : 0) },
  ];
}
