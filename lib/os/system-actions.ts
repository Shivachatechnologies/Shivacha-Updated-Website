"use server";

import { audit } from "@/lib/audit";
import { authorize } from "@/lib/auth/session";
import { recordSchedulerRun, runDailyJobs } from "@/lib/automation/scheduler";
import { aiDailyJobs } from "@/lib/ai/scheduled";
import { fail, okThen, type ActionState } from "./action";

/** Runs the (idempotent) daily jobs on demand — Super Admin / Admin only. */
export async function runSchedulerNowAction(): Promise<ActionState> {
  try {
    const user = await authorize("settings:manage");
    const started = Date.now();
    const reports = await runDailyJobs(aiDailyJobs());
    await recordSchedulerRun(`manual:${user.name}`, Date.now() - started, reports);
    await audit({ userId: user.id, action: "system.scheduler.run", metadata: { jobs: reports.length, failed: reports.filter((r) => r.error).length } });
    const failed = reports.filter((r) => r.error).length;
    return okThen("/admin/system", failed ? `Scheduler ran with ${failed} failed job(s).` : "Scheduler ran successfully.");
  } catch (e) {
    return fail(e, "system");
  }
}
