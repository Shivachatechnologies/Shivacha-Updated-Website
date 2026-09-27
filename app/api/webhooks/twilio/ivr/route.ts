import { db } from "@/lib/db/client";
import { IVR_OPTIONS, ivrSettings, readTwilio, twiml } from "@/lib/communication/ivr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Menu choice → route to the team's number (recorded only when recording is enabled and announced) or voicemail. */
export async function POST(req: Request) {
  const { params, valid } = await readTwilio(req);
  if (!valid) return new Response("Invalid signature", { status: 403 });
  const digit = (params.Digits ?? new URL(req.url).searchParams.get("Digits") ?? "3").slice(0, 1) as keyof typeof IVR_OPTIONS;
  const option = IVR_OPTIONS[digit] ?? "GENERAL";
  const s = await ivrSettings();
  if (params.CallSid) {
    const call = await db.call.findUnique({ where: { provider_providerCallId: { provider: "TWILIO", providerCallId: params.CallSid } } });
    if (call) await db.call.update({ where: { id: call.id }, data: { ivrOption: option, status: "IN_PROGRESS", events: { create: { type: "IVR", data: { digit, option } } } } });
  }
  const target = s[option];
  const record = s.recording ? ` record="record-from-answer-dual" recordingStatusCallback="/api/webhooks/twilio/recording" recordingStatusCallbackMethod="POST"` : "";
  if (target) return twiml(`<Say>Connecting you now.</Say><Dial timeout="25" action="/api/webhooks/twilio/status" method="POST"${record}>${target}</Dial>`);
  return twiml(`<Say>Please leave a message after the tone and we will call you back.</Say><Record maxLength="120" playBeep="true" recordingStatusCallback="/api/webhooks/twilio/recording" action="/api/webhooks/twilio/status"/>`);
}
