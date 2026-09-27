import "server-only";
import { after } from "next/server";
import { db } from "@/lib/db/client";
import { isEnabled } from "@/lib/os/flags";
import { runEvent } from "@/lib/automation/engine";
import { processDueTasks } from "./engine";
import { generateCeoBriefing, generateEndOfDayReports, generateMorningPlans } from "./reports";
import { localParts, type ScheduleTrigger } from "./profiles";

const MORNING_HOUR = 7;
const EVENING_HOUR = 18;
const CONTINUOUS_MINUTES = 10;

/** Atomically claims a once-only key (Setting primary key); false when another run already claimed it. */
async function claim(key: string) {
  try {
    await db.setting.create({ data: { key, value: { at: new Date().toISOString() } } });
    return true;
  } catch {
    return false;
  }
}

async function fire(trigger: ScheduleTrigger, period: string) {
  if (!(await claim(`workforce:fired:${trigger}:${period}`))) return false;
  await runEvent({ trigger, entity: "Schedule", entityId: `${trigger}:${period}`, payload: { schedule: { trigger, period } } });
  return true;
}

export interface PumpReport {
  fired: string[];
  reports: number;
  tasks: number;
}

/**
 * The AI workforce heartbeat. Emits the schedule triggers that drive recurring responsibilities (Automations with an
 * AI employee action), produces morning plans, end-of-day reports and the CEO briefing, and runs due tasks.
 * Idempotent: every window fires once, however often this runs. Called by the daily cron, by /api/cron/workforce
 * (for an external scheduler that pings more often) and opportunistically when the AI pages are opened.
 */
export async function pumpWorkforce(now = new Date()): Promise<PumpReport> {
  const out: PumpReport = { fired: [], reports: 0, tasks: 0 };
  if (!(await isEnabled("AI_WORKFORCE"))) return out;
  const { day, hour, weekday } = localParts(now);
  const yesterday = localParts(new Date(now.getTime() - 86400_000)).day;

  if (hour >= MORNING_HOUR) {
    if (await fire("SCHEDULE_MORNING", day)) out.fired.push("SCHEDULE_MORNING");
    if (await claim(`workforce:reports:morning:${day}`)) {
      // Yesterday's end-of-day report is written here if no evening run happened.
      if (await claim(`workforce:reports:eod:${yesterday}`)) out.reports += await generateEndOfDayReports(now, yesterday);
      out.reports += await generateMorningPlans(now);
      await db.setting.deleteMany({ where: { key: { startsWith: "workforce:" }, NOT: { key: "workforce:lastPump" }, updatedAt: { lt: new Date(now.getTime() - 8 * 86400_000) } } });
      await generateCeoBriefing(now, { notify: true });
      out.reports++;
    }
    if (weekday === "Mon" && (await fire("SCHEDULE_WEEKLY_MONDAY", day))) out.fired.push("SCHEDULE_WEEKLY_MONDAY");
  }
  if (hour >= EVENING_HOUR) {
    if (await fire("SCHEDULE_EVENING", day)) out.fired.push("SCHEDULE_EVENING");
    if (await claim(`workforce:reports:eod:${day}`)) out.reports += await generateEndOfDayReports(now, day);
  }
  const bucket = Math.floor(now.getTime() / (CONTINUOUS_MINUTES * 60_000));
  if (await fire("SCHEDULE_CONTINUOUS", String(bucket))) out.fired.push("SCHEDULE_CONTINUOUS");

  out.tasks = await processDueTasks(3);
  return out;
}

/** Page-load heartbeat: at most once every few minutes, after the response is sent. */
export function pumpSoon() {
  const run = async () => {
    const last = await db.setting.findUnique({ where: { key: "workforce:lastPump" } });
    const at = typeof (last?.value as { at?: string } | null)?.at === "string" ? Date.parse((last!.value as { at: string }).at) : 0;
    if (Date.now() - at < 3 * 60_000) return;
    await db.setting.upsert({ where: { key: "workforce:lastPump" }, update: { value: { at: new Date().toISOString() } }, create: { key: "workforce:lastPump", value: { at: new Date().toISOString() } } });
    await pumpWorkforce();
  };
  try {
    after(() => run().catch((e) => console.error("[workforce] pump failed", (e as Error).message)));
  } catch {
    // Outside a request: the cron routes call pumpWorkforce directly.
  }
}
