import "server-only";
import { mailMode, sendMail } from "@/lib/email/mailer";

/**
 * Communication provider abstraction. Nothing is sent automatically: every outbound message is an explicit,
 * permission-checked user action (or an approved AI/automation action from the Human Approval Center).
 */
export interface ChannelStatus {
  key: "email" | "whatsapp" | "twilio" | "exotel";
  name: string;
  connected: boolean;
  env: string[];
  note?: string;
}

export const channels = (): ChannelStatus[] => [
  { key: "email", name: "Email (Google Workspace SMTP / Gmail OAuth)", connected: mailMode() !== "none", env: ["SMTP_USER", "SMTP_PASS", "GMAIL_OAUTH_REFRESH_TOKEN"] },
  { key: "whatsapp", name: "WhatsApp Business Cloud API", connected: !!process.env.WHATSAPP_CLOUD_TOKEN && !!process.env.WHATSAPP_PHONE_NUMBER_ID, env: ["WHATSAPP_CLOUD_TOKEN", "WHATSAPP_PHONE_NUMBER_ID"], note: "Free-form messages only within 24 h of the customer's last message; otherwise use an approved template." },
  { key: "twilio", name: "Twilio Voice", connected: !!process.env.TWILIO_ACCOUNT_SID && !!process.env.TWILIO_AUTH_TOKEN, env: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER"] },
  { key: "exotel", name: "Exotel", connected: !!process.env.EXOTEL_SID && !!process.env.EXOTEL_API_KEY && !!process.env.EXOTEL_API_TOKEN, env: ["EXOTEL_SID", "EXOTEL_API_KEY", "EXOTEL_API_TOKEN", "EXOTEL_WEBHOOK_TOKEN"] },
];
export const channelConnected = (k: ChannelStatus["key"]) => channels().find((c) => c.key === k)!.connected;

export async function sendEmailMessage(to: string, subject: string, body: string) {
  const html = `<div style="font-family:system-ui,sans-serif;white-space:pre-wrap">${body.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!)}</div>`;
  const r = await sendMail({ to, subject, text: body, html });
  return { sent: r.sent, error: r.error, provider: mailMode() };
}

/** WhatsApp Cloud API text message (E.164 digits). */
export async function sendWhatsAppMessage(toDigits: string, body: string) {
  if (!channelConnected("whatsapp")) return { sent: false, error: "WhatsApp is not connected", ref: null };
  const res = await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(process.env.WHATSAPP_PHONE_NUMBER_ID!)}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_CLOUD_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: toDigits, type: "text", text: { body: body.slice(0, 4096), preview_url: false } }),
    signal: AbortSignal.timeout(15000),
  });
  const json = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message?: string } };
  return res.ok ? { sent: true, error: undefined, ref: json.messages?.[0]?.id ?? null } : { sent: false, error: json.error?.message ?? `HTTP ${res.status}`, ref: null };
}

/** Starts an outbound Twilio call that first rings the employee, then connects the customer. */
export async function startTwilioCall(agentPhone: string, customerPhone: string, statusCallback: string) {
  if (!channelConnected("twilio") || !process.env.TWILIO_PHONE_NUMBER) return { ok: false as const, error: "Twilio is not connected" };
  const twiml = `<Response><Say>Connecting you to the customer.</Say><Dial callerId="${process.env.TWILIO_PHONE_NUMBER}">${customerPhone.replace(/[^\d+]/g, "")}</Dial></Response>`;
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Calls.json`, {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ To: agentPhone, From: process.env.TWILIO_PHONE_NUMBER, Twiml: twiml, StatusCallback: statusCallback, StatusCallbackEvent: "completed" }),
    signal: AbortSignal.timeout(15000),
  });
  const json = (await res.json().catch(() => ({}))) as { sid?: string; message?: string };
  return res.ok && json.sid ? { ok: true as const, sid: json.sid } : { ok: false as const, error: json.message ?? `HTTP ${res.status}` };
}

export const digits = (p: string | null | undefined) => (p ?? "").replace(/\D/g, "");
