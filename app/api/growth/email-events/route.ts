import { z } from "zod";
import { safeEqual } from "@/lib/payments/signature";
import { handleReply, suppress } from "@/lib/growth/email";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Inbound email events from the mail provider or an inbox rule: bounces, spam complaints and replies.
 * Requires `Authorization: Bearer $GROWTH_WEBHOOK_TOKEN`; without the token configured the endpoint is disabled.
 *   { "type": "bounce" | "complaint" | "reply", "email": "…", "text": "reply body (reply only)" }
 */
const schema = z.object({ type: z.enum(["bounce", "complaint", "reply"]), email: z.string().trim().email().max(200), text: z.string().max(20_000).optional() });

export async function POST(req: Request) {
  const token = process.env.GROWTH_WEBHOOK_TOKEN;
  if (!token || !safeEqual(req.headers.get("authorization") ?? "", `Bearer ${token}`)) return new Response("Unauthorized", { status: 401 });
  if (!process.env.DATABASE_URL) return Response.json({ error: "no database" }, { status: 503 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid payload" }, { status: 400 });
  const e = parsed.data;
  if (e.type === "reply") {
    const r = await handleReply(e.email, e.text ?? "");
    await audit({ action: "growth.email.reply", metadata: { cls: r.cls, stopped: r.stopped, via: "webhook" } });
    return Response.json({ ok: true, classification: r.cls, stopped: r.stopped, suppressed: r.suppressed });
  }
  const stopped = await suppress(e.email, e.type === "bounce" ? "BOUNCE" : "COMPLAINT", `webhook ${e.type}`);
  await audit({ action: `growth.email.${e.type}`, metadata: { stopped, via: "webhook" } });
  return Response.json({ ok: true, suppressed: true, stopped });
}
