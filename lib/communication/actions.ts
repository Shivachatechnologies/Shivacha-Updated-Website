"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { audit } from "@/lib/audit";
import { siteConfig } from "@/data/siteConfig";
import { authorizeAccess } from "@/lib/os/guard";
import { fail, formObject, optDate, optId, optText, reqText, UserError, type ActionState } from "@/lib/os/action";
import { logActivity } from "@/lib/os/activity";
import { channelConnected, digits, sendEmailMessage, sendWhatsAppMessage, startTwilioCall } from "./providers";

const F = "COMMUNICATION" as const;
export type CommTarget = { leadId?: string | null; clientId?: string | null; dealId?: string | null; ticketId?: string | null; projectId?: string | null };

const targetSchema = z.object({ leadId: optId, clientId: optId, dealId: optId, ticketId: optId, projectId: optId });

async function recipient(t: CommTarget) {
  if (t.leadId) {
    const l = await db.lead.findUnique({ where: { id: t.leadId }, select: { email: true, phone: true, name: true } });
    return { email: l?.email ?? null, phone: l?.phone ?? null, name: l?.name ?? null };
  }
  if (t.clientId) {
    const c = await db.client.findUnique({ where: { id: t.clientId }, include: { contacts: { orderBy: { isPrimary: "desc" }, take: 1 } } });
    return { email: c?.contacts[0]?.email ?? c?.billingEmail ?? null, phone: c?.contacts[0]?.phone ?? c?.phone ?? null, name: c?.contacts[0]?.name ?? c?.name ?? null };
  }
  return { email: null, phone: null, name: null };
}

async function afterSend(t: CommTarget, actorId: string, type: string, summary: string) {
  if (t.leadId) await db.leadActivity.create({ data: { leadId: t.leadId, actorId, type, data: { summary } } });
  if (t.leadId) await db.lead.update({ where: { id: t.leadId }, data: { lastContactedAt: new Date() } }).catch(() => {});
  if (t.clientId || t.dealId) await logActivity({ type, summary, actorId, clientId: t.clientId, dealId: t.dealId });
}

const revalidateTarget = (t: CommTarget) => {
  if (t.leadId) revalidatePath(`/admin/leads/${t.leadId}`);
  if (t.clientId) revalidatePath(`/admin/clients/${t.clientId}`);
  revalidatePath("/admin/communication");
};

export async function sendEmailAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorizeAccess("communication:send", F);
    const o = formObject(form);
    const t = targetSchema.parse(o);
    const d = z.object({ to: z.string().trim().email("Enter a valid email").max(160), subject: reqText(200), body: z.string().trim().min(1, "Write a message").max(20000) }).parse(o);
    if (!channelConnected("email")) return { error: "Email is not connected. Configure SMTP or Gmail OAuth on the server." };
    const r = await sendEmailMessage(d.to, d.subject, `${d.body}\n\n— ${user.name}\n${siteConfig.name}`);
    await db.communication.create({ data: { channel: "EMAIL", direction: "OUTBOUND", status: r.sent ? "SENT" : "FAILED", subject: d.subject, body: d.body, toAddress: d.to, fromAddress: user.email, provider: r.provider, userId: user.id, error: r.error?.slice(0, 300), ...t } });
    if (!r.sent) return { error: `The email could not be sent: ${r.error ?? "unknown error"}` };
    await afterSend(t, user.id, "EMAIL_SENT", `Email: ${d.subject}`);
    await audit({ userId: user.id, action: "communication.email_sent", entity: t.leadId ? "Lead" : "Client", entityId: t.leadId ?? t.clientId ?? undefined, metadata: { to: d.to, subject: d.subject } });
    revalidateTarget(t);
    return { ok: `Email sent to ${d.to}.` };
  } catch (e) {
    return fail(e, "communication");
  }
}

export async function sendWhatsAppAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorizeAccess("communication:send", F);
    const o = formObject(form);
    const t = targetSchema.parse(o);
    const body = z.string().trim().min(1, "Write a message").max(4000).parse(o.body);
    const to = digits(z.string().min(7, "Enter a phone number").max(40).parse(o.to ?? (await recipient(t)).phone));
    if (to.length < 8) throw new UserError("Enter the number with country code.");
    if (!channelConnected("whatsapp")) return { error: "WhatsApp Cloud API is not connected. Use the wa.me link and log the conversation instead." };
    const r = await sendWhatsAppMessage(to, body);
    await db.communication.create({ data: { channel: "WHATSAPP", direction: "OUTBOUND", status: r.sent ? "SENT" : "FAILED", body, toAddress: `+${to}`, provider: "whatsapp-cloud", providerRef: r.ref, userId: user.id, error: r.error?.slice(0, 300), ...t } });
    if (!r.sent) return { error: `WhatsApp message failed: ${r.error}` };
    await afterSend(t, user.id, "CONTACTED", "WhatsApp message sent");
    await audit({ userId: user.id, action: "communication.whatsapp_sent", metadata: { to: `+${to}` } });
    revalidateTarget(t);
    return { ok: "WhatsApp message sent." };
  } catch (e) {
    return fail(e, "communication");
  }
}

/** Records a conversation that happened outside the system (phone, WhatsApp app, meeting, email thread). */
export async function logCommunicationAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorizeAccess("communication:view", F);
    const o = formObject(form);
    const t = targetSchema.parse(o);
    const d = z.object({ channel: z.enum(["EMAIL", "WHATSAPP", "MEETING", "SMS", "NOTE"]), direction: z.enum(["INBOUND", "OUTBOUND", "INTERNAL"]), subject: optText(200), body: z.string().trim().min(1, "Describe the conversation").max(20000), occurredAt: optDate, durationMin: z.preprocess((v) => (v === "" || v == null ? null : v), z.coerce.number().int().min(0).max(1440).nullable()) }).parse(o);
    await db.communication.create({ data: { ...d, occurredAt: d.occurredAt ?? new Date(), status: "LOGGED", provider: "manual", userId: user.id, ...t } });
    await afterSend(t, user.id, d.channel === "MEETING" ? "MEETING_LOGGED" : "CONTACTED", `${d.channel.toLowerCase()} logged${d.subject ? `: ${d.subject}` : ""}`);
    revalidateTarget(t);
    return { ok: "Logged on the timeline." };
  } catch (e) {
    return fail(e, "communication");
  }
}

export async function scheduleMeetingAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorizeAccess("communication:view", F);
    const o = formObject(form);
    const t = targetSchema.parse(o);
    const d = z.object({ subject: reqText(200), scheduledAt: optDate.refine((v) => !!v, "Pick a date and time"), durationMin: z.coerce.number().int().min(5).max(600).default(30), meetingUrl: z.preprocess((v) => (v == null ? "" : v), z.string().trim().max(500)).refine((v) => !v || /^https:\/\//.test(v), "Use an https:// link").transform((v) => v || null), body: optText(5000) }).parse(o);
    await db.communication.create({ data: { channel: "MEETING", direction: "OUTBOUND", status: "SCHEDULED", subject: d.subject, body: d.body, scheduledAt: d.scheduledAt, occurredAt: d.scheduledAt!, durationMin: d.durationMin, meetingUrl: d.meetingUrl, provider: "manual", userId: user.id, ...t } });
    if (t.leadId) await db.lead.update({ where: { id: t.leadId }, data: { status: "MEETING" } }).catch(() => {});
    await afterSend(t, user.id, "MEETING_SCHEDULED", `Meeting scheduled: ${d.subject}`);
    revalidateTarget(t);
    return { ok: "Meeting scheduled. Send the calendar invite from your calendar or Calendly." };
  } catch (e) {
    return fail(e, "communication");
  }
}

export async function setMeetingStatusAction(id: string, status: "COMPLETED" | "CANCELLED") {
  const user = await authorizeAccess("communication:view", F);
  await db.communication.update({ where: { id }, data: { status } });
  await audit({ userId: user.id, action: `meeting.${status.toLowerCase()}`, entity: "Communication", entityId: id });
  revalidatePath("/admin/communication/meetings");
}

/* ───────── calls ───────── */

const OUTCOMES = ["CONNECTED", "INTERESTED", "NOT_INTERESTED", "CALLBACK_REQUESTED", "WRONG_NUMBER", "SUPPORT_RESOLVED", "ESCALATED", "NO_OUTCOME"] as const;

export async function logCallAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorizeAccess("calls:view", "IVR");
    const o = formObject(form);
    const t = targetSchema.parse(o);
    const d = z.object({ direction: z.enum(["INBOUND", "OUTBOUND"]), fromNumber: optText(40), toNumber: optText(40), callerName: optText(200), status: z.enum(["COMPLETED", "MISSED", "NO_ANSWER", "BUSY", "VOICEMAIL"]), durationMin: z.preprocess((v) => (v === "" || v == null ? 0 : v), z.coerce.number().min(0).max(600)), outcome: z.enum(OUTCOMES).optional(), ivrOption: z.enum(["SALES", "HR", "GENERAL", "EXISTING_CLIENT", ""]).optional(), notes: optText(10000), startedAt: optDate }).parse(o);
    const call = await db.call.create({ data: { direction: d.direction, fromNumber: d.fromNumber, toNumber: d.toNumber, callerName: d.callerName, status: d.status, durationSec: Math.round(d.durationMin * 60), outcome: d.outcome, ivrOption: d.ivrOption || null, notes: d.notes, startedAt: d.startedAt ?? new Date(), provider: "MANUAL", userId: user.id, leadId: t.leadId, clientId: t.clientId } });
    await afterSend(t, user.id, "CALL_LOGGED", `Call ${d.direction.toLowerCase()} · ${d.status.toLowerCase()}${d.outcome ? ` · ${d.outcome.toLowerCase()}` : ""}`);
    await audit({ userId: user.id, action: "call.logged", entity: "Call", entityId: call.id });
    revalidateTarget(t);
    revalidatePath("/admin/communication/calls");
    return { ok: "Call logged." };
  } catch (e) {
    return fail(e, "communication");
  }
}

export async function updateCallAction(id: string, _: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorizeAccess("calls:view", "IVR");
    const d = z.object({ outcome: z.enum(OUTCOMES), notes: optText(10000), leadId: optId, clientId: optId }).parse(formObject(form));
    await db.call.update({ where: { id }, data: { outcome: d.outcome, notes: d.notes, ...(d.leadId && { leadId: d.leadId }), ...(d.clientId && { clientId: d.clientId }), userId: user.id } });
    await db.callEvent.create({ data: { callId: id, type: "OUTCOME", data: { outcome: d.outcome, by: user.id } } });
    revalidatePath("/admin/communication/calls");
    return { ok: "Call updated." };
  } catch (e) {
    return fail(e, "communication");
  }
}

/** Click-to-call through Twilio (rings the employee's phone first). */
export async function clickToCallAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorizeAccess("communication:send", "IVR");
    const o = formObject(form);
    const t = targetSchema.parse(o);
    const d = z.object({ agentPhone: z.string().trim().min(8, "Your phone number with country code").max(40), customerPhone: z.string().trim().min(8).max(40) }).parse(o);
    if (!channelConnected("twilio")) return { error: "Twilio is not connected." };
    const r = await startTwilioCall(`+${digits(d.agentPhone)}`, `+${digits(d.customerPhone)}`, `${siteConfig.url}/api/webhooks/twilio/status`);
    if (!r.ok) return { error: `Call could not be started: ${r.error}` };
    await db.call.create({ data: { direction: "OUTBOUND", fromNumber: process.env.TWILIO_PHONE_NUMBER, toNumber: `+${digits(d.customerPhone)}`, provider: "TWILIO", providerCallId: r.sid, status: "RINGING", userId: user.id, leadId: t.leadId, clientId: t.clientId } });
    return { ok: "Calling your phone now — answer to be connected." };
  } catch (e) {
    return fail(e, "communication");
  }
}

export async function saveIvrSettingsAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorizeAccess("settings:manage", "IVR");
    const phone = z.preprocess((v) => (v == null ? "" : v), z.string().trim().max(40)).refine((v) => !v || /^\+\d{8,15}$/.test(v.replace(/[\s-]/g, "")), "Use +countrycode number").transform((v) => v.replace(/[\s-]/g, ""));
    const d = z.object({ greeting: z.string().trim().min(5).max(500), recording: z.preprocess((v) => v === "on", z.boolean()), SALES: phone, HR: phone, GENERAL: phone, EXISTING_CLIENT: phone }).parse(formObject(form));
    await db.setting.upsert({ where: { key: "ivr" }, create: { key: "ivr", value: d }, update: { value: d } });
    await audit({ userId: user.id, action: "settings.ivr", entity: "Setting", entityId: "ivr", metadata: { recording: d.recording } });
    revalidatePath("/admin/communication/calls");
    return { ok: "IVR settings saved." };
  } catch (e) {
    return fail(e, "communication");
  }
}
