import { db } from "@/lib/db/client";
import { readTwilio, twiml } from "@/lib/communication/ivr";
import { notify } from "@/lib/os/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAP: Record<string, "COMPLETED" | "MISSED" | "BUSY" | "NO_ANSWER" | "FAILED" | "IN_PROGRESS"> = { completed: "COMPLETED", answered: "COMPLETED", busy: "BUSY", "no-answer": "NO_ANSWER", failed: "FAILED", canceled: "MISSED", "in-progress": "IN_PROGRESS" };

/** Call status callback (and Dial action): final status, duration, missed-call follow-up. */
export async function POST(req: Request) {
  const { params, valid } = await readTwilio(req);
  if (!valid) return new Response("Invalid signature", { status: 403 });
  const sid = params.CallSid;
  if (!sid) return twiml("");
  const call = await db.call.findUnique({ where: { provider_providerCallId: { provider: "TWILIO", providerCallId: sid } } });
  if (!call) return twiml("");
  const raw = params.DialCallStatus ?? params.CallStatus ?? "";
  const status = MAP[raw] ?? call.status;
  const duration = Number(params.DialCallDuration ?? params.CallDuration ?? 0) || call.durationSec;
  await db.call.update({ where: { id: call.id }, data: { status, durationSec: duration, endedAt: status === "IN_PROGRESS" ? null : new Date(), events: { create: { type: "STATUS", data: { raw, duration } } } } });
  if ((status === "NO_ANSWER" || status === "BUSY" || status === "MISSED") && call.direction === "INBOUND") {
    await db.task.create({ data: { title: `Call back ${call.callerName ?? call.fromNumber ?? "caller"} (${call.ivrOption?.toLowerCase().replace("_", " ") ?? "missed call"})`, priority: call.ivrOption === "SALES" ? "HIGH" : "MEDIUM", dueDate: new Date(Date.now() + 4 * 3600_000), leadId: call.leadId, source: "ivr:missed-call" } });
    await notify({ type: "followup.due", title: `Missed call from ${call.callerName ?? call.fromNumber ?? "unknown"}`, href: "/admin/communication/calls", permission: call.ivrOption === "EXISTING_CLIENT" ? "support:manage" : "calls:view" });
  }
  return twiml(status === "COMPLETED" ? "<Hangup/>" : "");
}
