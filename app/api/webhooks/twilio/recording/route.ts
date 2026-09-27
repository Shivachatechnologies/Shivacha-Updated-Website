import { db } from "@/lib/db/client";
import { readTwilio } from "@/lib/communication/ivr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Stores the recording link only for calls where recording was enabled and announced to the caller. */
export async function POST(req: Request) {
  const { params, valid } = await readTwilio(req);
  if (!valid) return new Response("Invalid signature", { status: 403 });
  const call = params.CallSid ? await db.call.findUnique({ where: { provider_providerCallId: { provider: "TWILIO", providerCallId: params.CallSid } } }) : null;
  if (!call) return new Response(null, { status: 204 });
  if (!call.recordingConsent) {
    await db.callEvent.create({ data: { callId: call.id, type: "RECORDING_DISCARDED", data: { reason: "recording not announced" } } });
    return new Response(null, { status: 204 });
  }
  if (params.RecordingUrl && /^https:\/\/api\.twilio\.com\//.test(params.RecordingUrl)) await db.call.update({ where: { id: call.id }, data: { recordingUrl: params.RecordingUrl, events: { create: { type: "RECORDING", data: { duration: params.RecordingDuration } } } } });
  return new Response(null, { status: 204 });
}
