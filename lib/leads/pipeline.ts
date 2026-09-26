/* Server-only module: the lead pipeline used by app/api/lead. */
import type { LeadType } from "@/lib/validation";
import { sendMail } from "@/lib/email/mailer";
import { applicantConfirmation, followUpIcs, salesNotification, visitorConfirmation } from "@/lib/email/templates";
import { newLeadId } from "./id";
import { nextFollowUp, scoreLead } from "./score";
import { forwardToWebhook, saveLead } from "./store";
import type { LeadRecord } from "./types";

const CORE = new Set(["name", "email", "phone", "company", "service", "budget", "message", "source", "utm_source", "utm_medium", "utm_campaign", "landing_page", "referrer", "type", "_t", "company_fax", "cf-turnstile-response"]);
const LABELS: Record<string, string> = { role: "Role", product: "Product", team: "Team needed", teamSize: "Team size", timeline: "Timeline", preferredTime: "Preferred time", division: "Division", resource: "Resource", job: "Role applied for", linkedin: "LinkedIn / portfolio", country: "Country (stated)", website: "Website", companySize: "Company size", industry: "Industry", requirement: "Requirement" };

export function buildLead(type: LeadType, v: Record<string, string>, files: LeadRecord["attachments"], ctx: { country: string; referer: string }): LeadRecord {
  const now = new Date();
  const lead = {
    email: v.email ?? "",
    phone: v.phone ?? "",
    company: v.company ?? "",
    service: v.service ?? "",
    budget: v.budget ?? "",
    description: v.message ?? "",
  };
  const { score, label } = scoreLead(lead);
  const extra: Record<string, string> = {};
  for (const [k, val] of Object.entries(v)) if (!CORE.has(k) && val) extra[LABELS[k] ?? k] = val;
  return {
    id: newLeadId(now),
    createdAt: now.toISOString(),
    formType: type,
    name: v.name ?? "",
    ...lead,
    country: v.country || ctx.country,
    sourcePage: v.source || ctx.referer,
    landingPage: v.landing_page ?? "",
    referrer: v.referrer ?? "",
    utmSource: v.utm_source ?? "",
    utmMedium: v.utm_medium ?? "",
    utmCampaign: v.utm_campaign ?? "",
    score,
    scoreLabel: label,
    status: "New",
    assignedTo: "",
    notes: "",
    lastContacted: "",
    nextFollowUp: nextFollowUp(now).toISOString(),
    extra,
    attachments: files,
  };
}

export const salesInbox = () => process.env.LEAD_NOTIFY_TO || "sales@shivacha.com";
export const hrInbox = () => process.env.HR_NOTIFY_TO || "hr@shivacha.com";

/**
 * Save → notify sales → confirm to visitor. A lead is accepted when at least one durable channel
 * (database or sales email) succeeded, so neither a mail outage nor a storage outage loses it.
 * Returns the work that can finish after the response (confirmation email, webhook).
 */
export async function processLead(lead: LeadRecord) {
  const store = await saveLead(lead);
  if (store.error) console.error("[lead] store failed", { id: lead.id, driver: store.driver, error: store.error });

  const newsletter = lead.formType === "newsletter";
  let notified = false;
  if (!newsletter) {
    const n = salesNotification(lead, store.viewUrl);
    const res = await sendMail({
      to: lead.formType === "job" ? hrInbox() : salesInbox(),
      replyTo: lead.email,
      subject: n.subject,
      text: n.text,
      html: n.html,
      attachments: [
        { filename: `follow-up-${lead.id}.ics`, content: followUpIcs(lead), contentType: "text/calendar; charset=utf-8; method=PUBLISH" },
        ...lead.attachments.map((f) => ({ filename: f.name, content: f.data, encoding: "base64", contentType: f.type })),
      ],
    });
    notified = res.sent;
    if (!res.sent) console.error("[lead] sales notification failed", { id: lead.id, error: res.error });
  }

  const accepted = store.stored || notified;

  const background = async () => {
    if (!newsletter) {
      const c = lead.formType === "job" ? applicantConfirmation(lead) : visitorConfirmation(lead);
      const r = await sendMail({ to: lead.email, replyTo: lead.formType === "job" ? hrInbox() : salesInbox(), subject: c.subject, text: c.text, html: c.html });
      if (!r.sent) console.error("[lead] confirmation failed", { id: lead.id, error: r.error });
    }
    await forwardToWebhook(lead).catch((e) => console.error("[lead] webhook failed", { id: lead.id, error: (e as Error).message }));
  };

  return { accepted, store, notified, background };
}
