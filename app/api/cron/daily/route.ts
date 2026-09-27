import { runDailyJobs } from "@/lib/automation/scheduler";
import { aiDailyJobs } from "@/lib/ai/scheduled";
import { safeEqual } from "@/lib/payments/signature";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Daily jobs (Vercel Cron → vercel.json). Vercel sends `Authorization: Bearer $CRON_SECRET`; anything else is
 * rejected, so the endpoint cannot be triggered publicly.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !safeEqual(req.headers.get("authorization") ?? "", `Bearer ${secret}`)) return new Response("Unauthorized", { status: 401 });
  if (!process.env.DATABASE_URL) return Response.json({ skipped: "no database" });
  const started = Date.now();
  const reports = await runDailyJobs(aiDailyJobs());
  return Response.json({ ok: true, ms: Date.now() - started, reports });
}
