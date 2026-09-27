import "server-only";

/** AI jobs added to the daily scheduler (insights, queued AI tasks, CEO briefing). Filled in by the AI workforce. */
export function aiDailyJobs(): { name: string; run: () => Promise<number> }[] {
  return [];
}
