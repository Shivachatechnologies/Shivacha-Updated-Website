import { pumpWorkforce } from "@/lib/ai/workforce/scheduler";
import { safeEqual } from "@/lib/payments/signature";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * AI workforce heartbeat for an external scheduler (e.g. every 10–15 minutes) so evening and continuous
 * responsibilities run on time. Same `Authorization: Bearer $CRON_SECRET` check as the daily cron.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !safeEqual(req.headers.get("authorization") ?? "", `Bearer ${secret}`)) return new Response("Unauthorized", { status: 401 });
  if (!process.env.DATABASE_URL) return Response.json({ skipped: "no database" });
  const started = Date.now();
  const report = await pumpWorkforce();
  return Response.json({ ok: true, ms: Date.now() - started, ...report });
}
