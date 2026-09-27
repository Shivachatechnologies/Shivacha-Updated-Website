import { db } from "@/lib/db/client";
import { safeEqual } from "@/lib/payments/signature";
import { IVR_OPTIONS, identifyCaller } from "@/lib/communication/ivr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUS: Record<string, "COMPLETED" | "MISSED" | "BUSY" | "NO_ANSWER" | "FAILED"> = { completed: "COMPLETED", busy: "BUSY", "no-answer": "NO_ANSWER", failed: "FAILED", canceled: "MISSED" };

/**
 * Exotel Passthru / status callback. Exotel does not sign requests, so the URL must carry the shared secret
 * (?token=EXOTEL_WEBHOOK_TOKEN) — requests without it are rejected.
 */
async function handle(req: Request) {
  const u = new URL(req.url);
  const token = process.env.EXOTEL_WEBHOOK_TOKEN;
  if (!token || !safeEqual(u.searchParams.get("token") ?? "", token)) return new Response("Forbidden", { status: 403 });
  const p = req.method === "POST" ? Object.fromEntries(new URLSearchParams(await req.text())) : Object.fromEntries(u.searchParams);
  const sid = p.CallSid;
  if (!sid) return new Response("Missing CallSid", { status: 400 });
  const digit = (p.digits ?? "").replace(/\D/g, "").slice(0, 1) as keyof typeof IVR_OPTIONS;
  const existing = await db.call.findUnique({ where: { provider_providerCallId: { provider: "EXOTEL", providerCallId: sid } } });
  const status = STATUS[(p.Status ?? p.DialCallStatus ?? "").toLowerCase()];
  if (!existing) {
    const who = await identifyCaller(p.CallFrom ?? p.From ?? null);
    await db.call.create({ data: { provider: "EXOTEL", providerCallId: sid, direction: (p.Direction ?? "incoming").startsWith("out") ? "OUTBOUND" : "INBOUND", fromNumber: p.CallFrom ?? p.From, toNumber: p.CallTo ?? p.To, callerName: who.name, leadId: who.leadId, clientId: who.clientId, ivrOption: IVR_OPTIONS[digit] ?? null, status: status ?? "IN_PROGRESS", durationSec: Number(p.DialCallDuration ?? p.Duration ?? 0) || null, recordingUrl: null, events: { create: { type: "EXOTEL", data: { status: p.Status, digits: p.digits } } } } });
  } else {
    await db.call.update({ where: { id: existing.id }, data: { ...(status && { status, endedAt: new Date() }), ...(IVR_OPTIONS[digit] && { ivrOption: IVR_OPTIONS[digit] }), durationSec: Number(p.DialCallDuration ?? p.Duration ?? 0) || existing.durationSec, events: { create: { type: "EXOTEL", data: { status: p.Status, digits: p.digits } } } } });
  }
  return new Response("OK", { status: 200 });
}
export const GET = handle;
export const POST = handle;
