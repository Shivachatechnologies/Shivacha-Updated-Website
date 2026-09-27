import "server-only";
import { db } from "@/lib/db/client";
import type { Prisma } from "@/lib/generated/prisma/client";
import { newLeadId } from "@/lib/leads/id";
import { audit } from "@/lib/audit";
import { nextNumber } from "@/lib/os/numbers";
import { logActivity } from "@/lib/os/activity";
import { CURRENCIES, type CurrencyCode } from "@/lib/os/money";
import { uncsv } from "@/lib/admin/csv";
import { LEAD_PRIORITIES, LEAD_STATUSES, type LeadStatusName } from "@/lib/admin/leads";
import { LIFECYCLE_STAGES, PIPELINE, STAGE_PROBABILITY } from "./constants";

export { LIFECYCLE_STAGES, PIPELINE, STAGE_PROBABILITY };

export const normPhone = (p: string | null | undefined) => (p ?? "").replace(/\D/g, "").slice(-10);

/* ───────── duplicates ───────── */

export interface DuplicateGroup {
  key: string;
  by: "email" | "phone";
  ids: string[];
}

/** Active leads sharing an email (case-insensitive) or the last 10 phone digits. Server-side paginated. */
export async function findDuplicateGroups(page = 1, size = 20): Promise<{ groups: DuplicateGroup[]; total: number }> {
  const rows = await db.$queryRaw<{ key: string; ids: string[]; total: bigint }[]>`
    WITH t AS (
      SELECT id, "createdAt", 'e:' || lower(email) AS key FROM "Lead" WHERE "archivedAt" IS NULL AND email <> ''
      UNION ALL
      SELECT id, "createdAt", 'p:' || right(regexp_replace(phone, '\\D', '', 'g'), 10) FROM "Lead"
        WHERE "archivedAt" IS NULL AND length(regexp_replace(coalesce(phone, ''), '\\D', '', 'g')) >= 7
    ), g AS (
      SELECT key, array_agg(id ORDER BY "createdAt") AS ids, max("createdAt") AS latest FROM t GROUP BY key HAVING count(*) > 1
    )
    SELECT key, ids, count(*) OVER () AS total FROM g ORDER BY latest DESC LIMIT ${size} OFFSET ${(page - 1) * size}`;
  return { groups: rows.map((r) => ({ key: r.key.slice(2), by: r.key.startsWith("e:") ? "email" : "phone", ids: r.ids.slice(0, 10) })), total: Number(rows[0]?.total ?? 0) };
}

const FILLABLE = ["company", "phone", "country", "city", "website", "service", "product", "budget", "message", "estimatedValue", "assignedToId", "lastContactedAt", "nextFollowUpAt", "campaign", "source", "landingPage", "referrer", "utmSource", "utmMedium", "utmCampaign", "utmTerm", "utmContent", "team"] as const;

/**
 * Merges `secondaryId` into `primaryId` in one transaction. Blank fields on the primary are filled from the secondary,
 * every related record is re-pointed, and the secondary is archived with mergedIntoId — nothing is deleted.
 */
export async function mergeLeads(primaryId: string, secondaryId: string, actorId: string) {
  if (primaryId === secondaryId) throw new Error("Choose two different leads.");
  return db.$transaction(async (tx) => {
    const [a, b] = await Promise.all([tx.lead.findUnique({ where: { id: primaryId }, include: { client: { select: { id: true } } } }), tx.lead.findUnique({ where: { id: secondaryId }, include: { client: { select: { id: true } } } })]);
    if (!a || !b) throw new Error("Lead not found.");
    if (a.archivedAt || b.archivedAt) throw new Error("Archived leads cannot be merged.");
    const fill: Record<string, unknown> = {};
    for (const f of FILLABLE) if ((a[f] === null || a[f] === "") && b[f] !== null && b[f] !== "") fill[f] = b[f];
    fill.tags = [...new Set([...a.tags, ...b.tags])];
    if ((b.score ?? -1) > (a.score ?? -1)) Object.assign(fill, { score: b.score, scoreLabel: b.scoreLabel });
    if (b.message && a.message && b.message !== a.message) fill.message = `${a.message}\n\n— merged from ${b.ref} —\n${b.message}`.slice(0, 20000);
    await tx.lead.update({ where: { id: a.id }, data: fill as Prisma.LeadUpdateInput });
    const move = { where: { leadId: b.id }, data: { leadId: a.id } };
    await Promise.all([tx.leadNote.updateMany(move), tx.leadActivity.updateMany(move), tx.followUp.updateMany(move), tx.deal.updateMany(move), tx.proposal.updateMany(move), tx.communication.updateMany(move), tx.call.updateMany(move), tx.task.updateMany(move)]);
    if (b.client && !a.client) await tx.client.update({ where: { id: b.client.id }, data: { leadId: a.id } });
    await tx.lead.update({ where: { id: b.id }, data: { archivedAt: new Date(), mergedIntoId: a.id } });
    await tx.leadActivity.createMany({
      data: [
        { leadId: a.id, actorId, type: "MERGED", data: { from: b.ref, fromId: b.id } },
        { leadId: b.id, actorId, type: "MERGED_INTO", data: { into: a.ref, intoId: a.id } },
      ],
    });
    return { primary: a, secondary: b };
  });
}

/* ───────── CSV import ───────── */

const ALIASES: Record<string, string[]> = {
  name: ["name", "full name", "fullname", "contact", "contact name"],
  email: ["email", "e-mail", "email address"],
  phone: ["phone", "mobile", "whatsapp", "phone number", "telephone"],
  company: ["company", "organisation", "organization", "company name"],
  country: ["country"],
  city: ["city"],
  website: ["website", "url", "domain"],
  service: ["service", "service interest", "interest"],
  product: ["product", "product interest"],
  budget: ["budget"],
  source: ["source", "lead source"],
  campaign: ["campaign", "utm campaign", "utmcampaign"],
  message: ["message", "notes", "note", "description", "requirement"],
  status: ["status"],
  priority: ["priority"],
  tags: ["tags", "labels"],
  estimatedValue: ["estimated value", "estimatedvalue", "value", "deal value"],
  currency: ["currency"],
};

export function mapHeaders(header: string[]) {
  const norm = header.map((h) => h.trim().toLowerCase().replace(/[_-]+/g, " "));
  const map: Record<string, number> = {};
  for (const [field, names] of Object.entries(ALIASES)) {
    const i = norm.findIndex((h) => names.includes(h));
    if (i >= 0) map[field] = i;
  }
  return map;
}

export interface ImportResult {
  total: number;
  created: number;
  skippedDuplicates: number;
  invalid: { row: number; reason: string }[];
  dryRun: boolean;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Imports leads from parsed CSV rows. Duplicates (existing email) are skipped or flagged, never overwritten. */
export async function importLeads(rows: string[][], opts: { duplicates: "skip" | "flag"; dryRun: boolean; source: string; ownerId: string | null }, actorId: string): Promise<ImportResult> {
  const [header, ...body] = rows;
  if (!header) throw new Error("The file is empty.");
  const map = mapHeaders(header);
  if (map.name === undefined || map.email === undefined) throw new Error("The CSV needs at least 'name' and 'email' columns.");
  const get = (r: string[], f: string) => (map[f] === undefined ? "" : uncsv(r[map[f]] ?? ""));
  const emails = [...new Set(body.map((r) => get(r, "email").toLowerCase()).filter(Boolean))];
  const existing = new Set<string>();
  for (let i = 0; i < emails.length; i += 1000) {
    const found = await db.lead.findMany({ where: { email: { in: emails.slice(i, i + 1000), mode: "insensitive" } }, select: { email: true } });
    for (const f of found) existing.add(f.email.toLowerCase());
  }
  const result: ImportResult = { total: body.length, created: 0, skippedDuplicates: 0, invalid: [], dryRun: opts.dryRun };
  const seen = new Set<string>();
  const data: Prisma.LeadCreateManyInput[] = [];
  body.forEach((r, i) => {
    const rowNo = i + 2;
    const name = get(r, "name").slice(0, 200);
    const email = get(r, "email").toLowerCase().slice(0, 160);
    if (!name) return result.invalid.push({ row: rowNo, reason: "Missing name" });
    if (!EMAIL_RE.test(email)) return result.invalid.push({ row: rowNo, reason: "Invalid email" });
    const dup = existing.has(email) || seen.has(email);
    seen.add(email);
    if (dup && opts.duplicates === "skip") return result.skippedDuplicates++;
    const status = get(r, "status").toUpperCase().replace(/\s+/g, "_");
    const priority = get(r, "priority").toUpperCase();
    const cur = get(r, "currency").toUpperCase();
    const valueRaw = get(r, "estimatedValue").replace(/[^\d.]/g, "");
    const value = /^\d{1,12}(\.\d{1,2})?$/.test(valueRaw) ? valueRaw : null;
    const tags = get(r, "tags").split(/[;,|]/).map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 20);
    if (dup) tags.push("possible-duplicate");
    data.push({
      ref: newLeadId(),
      name,
      email,
      phone: get(r, "phone").slice(0, 40) || null,
      company: get(r, "company").slice(0, 200) || null,
      country: get(r, "country").slice(0, 80) || null,
      city: get(r, "city").slice(0, 80) || null,
      website: get(r, "website").slice(0, 300) || null,
      service: get(r, "service").slice(0, 120) || null,
      product: get(r, "product").slice(0, 120) || null,
      budget: get(r, "budget").slice(0, 40) || null,
      message: get(r, "message").slice(0, 5000) || null,
      source: (get(r, "source") || opts.source).slice(0, 120),
      campaign: get(r, "campaign").slice(0, 120) || null,
      utmCampaign: get(r, "campaign").slice(0, 120) || null,
      status: (LEAD_STATUSES as readonly string[]).includes(status) ? (status as LeadStatusName) : "NEW",
      priority: (LEAD_PRIORITIES as readonly string[]).includes(priority) ? (priority as "LOW") : "MEDIUM",
      estimatedValue: value,
      currency: (CURRENCIES as readonly string[]).includes(cur) ? (cur as CurrencyCode) : "USD",
      tags: [...new Set(tags)],
      formType: "import",
      assignedToId: opts.ownerId,
    });
  });
  if (opts.dryRun) {
    result.created = data.length;
    return result;
  }
  for (let i = 0; i < data.length; i += 500) {
    const chunk = data.slice(i, i + 500);
    await db.$transaction(async (tx) => {
      await tx.lead.createMany({ data: chunk });
      const refs = chunk.map((c) => c.ref);
      const created = await tx.lead.findMany({ where: { ref: { in: refs } }, select: { id: true } });
      await tx.leadActivity.createMany({ data: created.map((c) => ({ leadId: c.id, actorId, type: "CREATED", data: { formType: "import", source: opts.source } })) });
    });
    result.created += chunk.length;
  }
  await audit({ userId: actorId, action: "lead.imported", entity: "Lead", metadata: { created: result.created, skipped: result.skippedDuplicates, invalid: result.invalid.length } });
  return result;
}

/* ───────── lead → deal ───────── */

export async function convertLeadToDeal(leadId: string, actorId: string, opts: { name?: string | null; ownerId?: string | null } = {}) {
  return db.$transaction(async (tx) => {
    const lead = await tx.lead.findUnique({ where: { id: leadId }, include: { client: { select: { id: true } } } });
    if (!lead) throw new Error("Lead not found.");
    if (lead.archivedAt) throw new Error("Restore the lead before converting it.");
    const number = await nextNumber("deal", tx);
    const deal = await tx.deal.create({
      data: {
        number,
        name: (opts.name || [lead.company || lead.name, lead.service || lead.product].filter(Boolean).join(" — ")).slice(0, 200),
        leadId: lead.id,
        clientId: lead.client?.id ?? null,
        company: lead.company,
        ownerId: opts.ownerId ?? lead.assignedToId ?? actorId,
        value: lead.estimatedValue ?? 0,
        currency: lead.currency,
        stage: "QUALIFICATION",
        probability: STAGE_PROBABILITY.QUALIFICATION,
        services: lead.service ? [lead.service] : [],
        products: lead.product ? [lead.product] : [],
        country: lead.country,
        source: lead.source,
        notes: lead.message,
      },
    });
    await tx.lead.update({ where: { id: lead.id }, data: { lifecycleStage: "OPPORTUNITY", status: ["NEW", "CONTACTED"].includes(lead.status) ? "QUALIFIED" : lead.status } });
    await tx.leadActivity.create({ data: { leadId: lead.id, actorId, type: "CONVERTED_TO_DEAL", data: { dealId: deal.id, number } } });
    await logActivity({ type: "CREATED", summary: `Deal created from lead ${lead.ref}`, actorId, dealId: deal.id }, tx);
    return deal;
  });
}
