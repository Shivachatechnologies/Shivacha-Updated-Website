import { db } from "@/lib/db/client";
import { identifyCaller, ivrSettings, readTwilio, twiml, xml } from "@/lib/communication/ivr";
import { isEnabled } from "@/lib/os/flags";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Incoming call: identify the caller, create the call record, play the IVR menu. */
export async function POST(req: Request) {
  const { params, valid } = await readTwilio(req);
  if (!valid) return new Response("Invalid signature", { status: 403 });
  if (!(await isEnabled("IVR"))) return twiml(`<Say>Sorry, our phone lines are closed. Please email info@shivacha.com.</Say><Hangup/>`);
  const s = await ivrSettings();
  const who = await identifyCaller(params.From ?? null);
  await db.call.upsert({
    where: { provider_providerCallId: { provider: "TWILIO", providerCallId: params.CallSid ?? "" } },
    create: { provider: "TWILIO", providerCallId: params.CallSid, direction: "INBOUND", fromNumber: params.From, toNumber: params.To, callerName: who.name, leadId: who.leadId, clientId: who.clientId, status: "RINGING", recordingConsent: s.recording, events: { create: { type: "INCOMING", data: { from: params.From, identified: !!(who.leadId || who.clientId) } } } },
    update: {},
  });
  const notice = s.recording ? "<Say>This call may be recorded for quality and training purposes.</Say>" : "";
  return twiml(`${notice}<Gather numDigits="1" timeout="8" action="/api/webhooks/twilio/ivr" method="POST"><Say>${xml(s.greeting)}</Say></Gather><Redirect method="POST">/api/webhooks/twilio/ivr?Digits=3</Redirect>`);
}
