import "server-only";
import { db } from "@/lib/db/client";
import { siteConfig } from "@/data/siteConfig";
import { classifyReply, isEmail, nextStepAt, normalizeEmail, renderStep, STOPS_SEQUENCE, SUPPRESSES, unsubscribeToken, type ReplyClass, type SequenceStep } from "./email-rules";
import { emailProvider, unsubscribeSecret } from "./providers";
import { growthStop } from "./settings";
import { budgetGate, qualifyLeadById, recordTouch, recordUsage } from "./engine";

export const SUPPRESSION_REASONS = ["UNSUBSCRIBE", "BOUNCE", "COMPLAINT", "NEGATIVE_REPLY", "MANUAL"] as const;
export type SuppressionReason = (typeof SUPPRESSION_REASONS)[number];

export async function isSuppressed(email: string) {
  return !!(await db.emailSuppression.findUnique({ where: { email: normalizeEmail(email) }, select: { id: true } }));
}

/** Adds the address to the suppression list and stops every active sequence for it. Idempotent. */
export async function suppress(email: string, reason: SuppressionReason, note?: string) {
  const e = normalizeEmail(email);
  await db.emailSuppression.upsert({ where: { email: e }, create: { email: e, reason, note: note?.slice(0, 500) }, update: {} });
  const r = await db.sequenceEnrollment.updateMany({ where: { email: { equals: e, mode: "insensitive" }, status: "ACTIVE" }, data: { status: "STOPPED", stopReason: reason, nextAt: null } });
  return r.count;
}

export const parseSteps = (v: unknown): SequenceStep[] =>
  Array.isArray(v)
    ? v
        .map((s) => s as Partial<SequenceStep>)
        .filter((s) => typeof s.day === "number" && typeof s.subject === "string" && typeof s.body === "string")
        .map((s) => ({ day: Math.max(0, Math.min(365, Math.round(s.day!))), subject: s.subject!, body: s.body! }))
        .sort((a, b) => a.day - b.day)
    : [];

/** Enrolls an address. Suppressed or invalid addresses are refused; re-enrolling an existing address is a no-op. */
export async function enroll(sequenceId: string, p: { email: string; name?: string | null; leadId?: string | null; prospectId?: string | null }): Promise<{ ok: boolean; reason?: string; id?: string }> {
  const email = normalizeEmail(p.email);
  if (!isEmail(email)) return { ok: false, reason: "Invalid email address." };
  if (await isSuppressed(email)) return { ok: false, reason: "This address has unsubscribed or is suppressed." };
  const seq = await db.emailSequence.findUnique({ where: { id: sequenceId } });
  if (!seq) return { ok: false, reason: "Sequence not found." };
  const steps = parseSteps(seq.steps);
  if (!steps.length) return { ok: false, reason: "The sequence has no steps." };
  const existing = await db.sequenceEnrollment.findUnique({ where: { sequenceId_email: { sequenceId, email } } });
  if (existing) return { ok: true, id: existing.id, reason: "Already enrolled." };
  const row = await db.sequenceEnrollment.create({ data: { sequenceId, email, name: p.name ?? null, leadId: p.leadId ?? null, prospectId: p.prospectId ?? null, step: 0, nextAt: nextStepAt(steps, 0, new Date()) } });
  return { ok: true, id: row.id };
}

/**
 * Handles a reply received for an address (logged by a person or an inbound hook). Any real reply stops automation so
 * a human takes over; unsubscribe and negative replies also suppress the address.
 */
export async function handleReply(email: string, text: string): Promise<{ cls: ReplyClass; stopped: number; suppressed: boolean }> {
  const e = normalizeEmail(email);
  const cls = classifyReply(text);
  let stopped = 0;
  if (SUPPRESSES[cls]) stopped = await suppress(e, cls === "UNSUBSCRIBE" ? "UNSUBSCRIBE" : "NEGATIVE_REPLY", text.slice(0, 200));
  else if (STOPS_SEQUENCE[cls]) stopped = (await db.sequenceEnrollment.updateMany({ where: { email: { equals: e, mode: "insensitive" }, status: "ACTIVE" }, data: { status: "STOPPED", stopReason: `REPLY_${cls}`, nextAt: null } })).count;
  const lead = await db.lead.findFirst({ where: { email: { equals: e, mode: "insensitive" }, archivedAt: null, mergedIntoId: null }, select: { id: true } });
  if (lead) {
    await recordTouch({ leadId: lead.id, channel: "EMAIL", kind: "REPLY" });
    await db.leadActivity.create({ data: { leadId: lead.id, type: "EMAIL_REPLY", data: { class: cls } } });
    if (cls === "POSITIVE" || cls === "NEUTRAL") await qualifyLeadById(lead.id);
  }
  await db.prospect.updateMany({ where: { email: { equals: e, mode: "insensitive" }, status: { in: ["NEW", "RESEARCHED", "CONTACTED"] } }, data: { status: cls === "UNSUBSCRIBE" || cls === "NEGATIVE" ? "DISQUALIFIED" : "REPLIED" } });
  return { cls, stopped, suppressed: SUPPRESSES[cls] };
}

export interface EmailRunResult {
  sent: number;
  skipped: number;
  failed: number;
  blocked: string | null;
}

/**
 * Sends due sequence steps. Checks, in order: kill switches / channel toggle, unsubscribe signing secret, email
 * provider, daily email budget, then per message: suppression list. Stops at the first provider error.
 */
export async function processDueEmails(opts: { autonomous: boolean; limit?: number }): Promise<EmailRunResult> {
  const out: EmailRunResult = { sent: 0, skipped: 0, failed: 0, blocked: null };
  const stop = await growthStop({ kind: "channel", channel: "email", autonomous: opts.autonomous });
  if (stop) return { ...out, blocked: stop };
  const secret = unsubscribeSecret();
  if (!secret) return { ...out, blocked: "Unsubscribe signing secret is not configured (GROWTH_UNSUBSCRIBE_SECRET)." };
  if (!emailProvider.status().connected) return { ...out, blocked: "Email provider is not connected." };

  const due = await db.sequenceEnrollment.findMany({ where: { status: "ACTIVE", nextAt: { lte: new Date() }, sequence: { active: true } }, include: { sequence: true }, orderBy: { nextAt: "asc" }, take: opts.limit ?? 200 });
  for (const en of due) {
    if (en.sequence.purpose === "OUTBOUND") {
      const s = await growthStop({ kind: "channel", channel: "email", autonomous: opts.autonomous, outbound: true });
      if (s) {
        out.skipped++;
        continue;
      }
    }
    // Re-check the kill switch before every send: a human can stop email mid-run.
    const live = await growthStop({ kind: "channel", channel: "email", autonomous: opts.autonomous });
    if (live) return { ...out, blocked: live };
    const budget = await budgetGate("emailDaily", 1);
    if (!budget.ok) return { ...out, blocked: `Email budget: ${budget.reason}` };
    if (await isSuppressed(en.email)) {
      await db.sequenceEnrollment.update({ where: { id: en.id }, data: { status: "STOPPED", stopReason: "SUPPRESSED", nextAt: null } });
      out.skipped++;
      continue;
    }
    const steps = parseSteps(en.sequence.steps);
    const step = steps[en.step];
    if (!step) {
      await db.sequenceEnrollment.update({ where: { id: en.id }, data: { status: "COMPLETED", nextAt: null } });
      continue;
    }
    const company = en.leadId ? (await db.lead.findUnique({ where: { id: en.leadId }, select: { company: true } }))?.company : null;
    const msg = renderStep(step, { name: en.name, company, unsubscribeUrl: `${siteConfig.url}/api/growth/unsubscribe?t=${encodeURIComponent(unsubscribeToken(en.email, secret))}` });
    const r = await emailProvider.send(en.email, msg.subject, msg.body);
    if (!r.ok) {
      out.failed++;
      await db.sequenceEnrollment.update({ where: { id: en.id }, data: { stopReason: `SEND_FAILED: ${r.error}`.slice(0, 190) } });
      return { ...out, blocked: r.error };
    }
    await recordUsage("emailDaily", 1);
    const next = en.step + 1;
    const nextAt = nextStepAt(steps, next, en.createdAt);
    await db.sequenceEnrollment.update({ where: { id: en.id }, data: { step: next, lastSentAt: new Date(), status: nextAt ? "ACTIVE" : "COMPLETED", nextAt, stopReason: null } });
    if (en.leadId) await db.leadActivity.create({ data: { leadId: en.leadId, type: "EMAIL_SENT", data: { sequence: en.sequence.name, step: en.step + 1, subject: msg.subject } } });
    if (en.prospectId) await db.prospect.updateMany({ where: { id: en.prospectId, status: { in: ["NEW", "RESEARCHED"] } }, data: { status: "CONTACTED" } });
    out.sent++;
  }
  return out;
}
