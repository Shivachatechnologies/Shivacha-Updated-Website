import "server-only";
import { db } from "@/lib/db/client";
import type { LeadRecord } from "./types";
import { queueEvent } from "@/lib/automation/engine";
import { notify } from "@/lib/os/notify";

/** Source label for reporting: UTM source, else referrer host, else direct. */
function sourceOf(l: LeadRecord) {
  if (l.utmSource) return l.utmSource.slice(0, 120);
  try {
    if (l.referrer) return new URL(l.referrer).host;
  } catch {
    /* ignore */
  }
  return "direct";
}

/** Saves a website lead into the CRM (Neon PostgreSQL). Newsletter sign-ups are not leads. */
export async function saveLeadToDatabase(l: LeadRecord): Promise<{ stored: boolean; error?: string; id?: string }> {
  if (!process.env.DATABASE_URL || l.formType === "newsletter") return { stored: false };
  try {
    const extra = { ...l.extra };
    const row = await db.lead.create({
      data: {
        ref: l.id,
        name: l.name.slice(0, 200) || "(no name)",
        company: l.company || null,
        email: l.email,
        phone: l.phone || null,
        country: l.country || null,
        service: l.service || null,
        product: extra["Product"] || null,
        budget: l.budget || null,
        message: l.description || null,
        formType: l.formType,
        source: sourceOf(l),
        campaign: l.utmCampaign || null,
        landingPage: l.landingPage || l.sourcePage || null,
        referrer: l.referrer || null,
        utmSource: l.utmSource || null,
        utmMedium: l.utmMedium || null,
        utmCampaign: l.utmCampaign || null,
        utmTerm: extra["UTM Term"] || null,
        utmContent: extra["UTM Content"] || null,
        score: l.score,
        scoreLabel: l.scoreLabel,
        priority: l.scoreLabel === "Hot" ? "HIGH" : "MEDIUM",
        nextFollowUpAt: l.nextFollowUp ? new Date(l.nextFollowUp) : null,
        extra: { ...extra, sourcePage: l.sourcePage, attachments: l.attachments.map(({ name, type, size }) => ({ name, type, size })) },
        activities: { create: { type: "CREATED", data: { formType: l.formType, source: sourceOf(l), score: l.score } } },
      },
      select: { id: true, name: true, email: true, company: true, country: true, service: true, product: true, budget: true, source: true, score: true, scoreLabel: true, priority: true, formType: true, assignedToId: true },
    });
    // Shivacha OS: NEW_LEAD automations and the in-app notification run after the response (never block or fail the form).
    queueEvent({ trigger: "NEW_LEAD", entity: "Lead", entityId: row.id, ownerId: row.assignedToId, payload: { lead: { ...row, ref: l.id } } });
    void notify({ type: "lead.new", title: `New lead: ${row.name}${row.company ? ` (${row.company})` : ""}`, body: [row.service ?? row.product, row.country, row.budget].filter(Boolean).join(" · "), href: `/admin/leads/${row.id}`, entity: "Lead", entityId: row.id, permission: "leads:assign" });
    return { stored: true, id: row.id };
  } catch (e) {
    return { stored: false, error: (e as Error).message };
  }
}
