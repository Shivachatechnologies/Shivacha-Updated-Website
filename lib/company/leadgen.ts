import "server-only";
import { db } from "@/lib/db/client";
import { Prisma } from "@/lib/generated/prisma/client";
import { audit } from "@/lib/audit";
import { enrichmentProvider, leadProviders, type ProspectRecord } from "@/lib/growth/providers";
import { growthStop } from "@/lib/growth/settings";
import { releaseClaim, takeClaim } from "@/lib/growth/engine";
import { isEmail, normalizeEmail } from "@/lib/growth/email-rules";
import { hydrateVault } from "@/lib/integrations/vault";
import { icpFit, parseLeadGen, verificationOf, type LeadGenConfig, type RunStep, type RunSummary } from "./leadgen-rules";

const json = (v: unknown) => JSON.parse(JSON.stringify(v ?? null)) as Prisma.InputJsonValue;
const utcDay = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
};

export class LeadGenError extends Error {}

/**
 * The lead generation pipeline for one campaign, on the EXISTING Prospect table and CRM:
 *   DISCOVER (connected providers only) → DEDUPLICATE → SUPPRESSION → VERIFY → INTENT (visitor intelligence)
 *   → ICP SCORE → QUALIFY → (CRM: a prospect becomes a lead only when a person converts a reply — existing rule)
 *   → SDR (qualified prospects waiting for a person to enrol them in an outbound sequence).
 * Each step reports DONE / NOT_CONNECTED / SKIPPED / BLOCKED with real counts; nothing is simulated.
 * One run per campaign at a time (named claim), and discovery never exceeds the campaign's daily target.
 */
export async function runLeadPipeline(campaignId: string, opts: { actor: string; autonomous?: boolean; maxDiscover?: number; maxVerify?: number }): Promise<RunSummary> {
  await hydrateVault();
  const stop = await growthStop({ kind: "channel", channel: "leadGen", autonomous: !!opts.autonomous });
  if (stop) throw new LeadGenError(`Lead generation is stopped: ${stop}`);
  const campaign = await db.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new LeadGenError("Campaign not found.");
  if (!campaign.leadGen) throw new LeadGenError("This campaign has no lead generation setup.");
  const cfg = parseLeadGen(campaign.leadGen);
  const claim = `leadgen-run:${campaignId}`;
  if (!(await takeClaim(claim, 15 * 60_000))) throw new LeadGenError("A run for this campaign is already in progress.");
  const steps: RunStep[] = [];
  const out: RunSummary = { at: new Date().toISOString(), by: opts.actor, discovered: 0, duplicates: 0, alreadyInCrm: 0, suppressed: 0, verified: 0, qualified: 0, disqualified: 0, steps };
  try {
    await discover(campaignId, cfg, campaign.dailyLeadTarget, opts, out);
    await verify(campaignId, opts.maxVerify ?? 25, out);
    await intent(campaignId, out);
    await scoreAndQualify(campaignId, cfg, out);
    const replied = await db.prospect.count({ where: { campaignId, status: "REPLIED" } });
    steps.push({ key: "crm", status: "DONE", count: replied, note: "Prospects become CRM leads only when they reply and a person converts them (no unsolicited records in the CRM)." });
    const ready = await db.prospect.count({ where: { campaignId, status: "RESEARCHED", email: { not: null } } });
    steps.push({ key: "sdr", status: "DONE", count: ready, note: "Qualified prospects ready for outreach. Enrolling them in an outbound sequence is a human decision; sending follows the email kill switches and budgets." });
    const next = { ...cfg, duplicatesTotal: cfg.duplicatesTotal + out.duplicates, lastRun: out };
    await db.campaign.update({ where: { id: campaignId }, data: { leadGen: json(next) } });
    await audit({ userId: /^c[a-z0-9]{20,}$/.test(opts.actor) ? opts.actor : null, action: "company.leadgen.run", entity: "Campaign", entityId: campaignId, metadata: { by: opts.actor, discovered: out.discovered, duplicates: out.duplicates, verified: out.verified, qualified: out.qualified, steps: steps.map((s) => `${s.key}:${s.status}`) } });
    return out;
  } finally {
    await releaseClaim(claim);
  }
}

async function discover(campaignId: string, cfg: LeadGenConfig, dailyTarget: number | null, opts: { actor: string; maxDiscover?: number }, out: RunSummary) {
  const today = await db.prospect.count({ where: { campaignId, createdAt: { gte: utcDay() } } });
  const remaining = Math.max(0, (dailyTarget ?? 25) - today);
  const cap = Math.min(remaining, opts.maxDiscover ?? 25, 100);
  if (cap <= 0) {
    out.steps.push({ key: "discover", status: "SKIPPED", count: 0, note: `Today's discovery target (${dailyTarget ?? 25}) is already reached.` });
    return;
  }
  const records: { r: ProspectRecord; source: string }[] = [];
  const notes: string[] = [];
  let connected = 0;
  if (cfg.sources.includes("apollo")) {
    if (!leadProviders.apollo.status().connected) notes.push("Apollo NOT CONNECTED");
    else if (!cfg.titles.length && !cfg.domains.length) notes.push("Apollo needs job titles or company domains in the campaign ICP");
    else {
      connected++;
      const r = await leadProviders.apollo.peopleSearch({ titles: cfg.titles.length ? cfg.titles : undefined, countries: cfg.countries.length ? cfg.countries : undefined, domains: cfg.domains.length ? cfg.domains.slice(0, 25) : undefined, perPage: Math.min(cap, 25) });
      if (r.ok) records.push(...r.data.map((x) => ({ r: x, source: "apollo" })));
      else notes.push(r.error);
    }
  }
  if (cfg.sources.includes("hunter") && records.length < cap) {
    if (!leadProviders.hunter.status().connected) notes.push("Hunter NOT CONNECTED");
    else if (!cfg.domains.length) notes.push("Hunter needs company domains in the campaign");
    else {
      connected++;
      for (const d of cfg.domains.slice(0, 5)) {
        if (records.length >= cap) break;
        const r = await leadProviders.hunter.domainSearch(d, Math.min(10, cap - records.length));
        if (r.ok) records.push(...r.data.map((x) => ({ r: x, source: "hunter" })));
        else {
          notes.push(r.error);
          if (r.code !== "PROVIDER_ERROR") break;
        }
      }
    }
  }
  if (!connected) {
    out.steps.push({ key: "discover", status: "NOT_CONNECTED", count: 0, note: notes.join(" · ") || "No lead source is connected." });
    return;
  }
  const suppressed = new Set((await db.emailSuppression.findMany({ where: { email: { in: records.map((x) => (x.r.email ? normalizeEmail(x.r.email) : "")).filter(Boolean) } }, select: { email: true } })).map((s) => s.email));
  let noContact = 0;
  for (const { r, source } of records) {
    if (out.discovered >= cap) break;
    const email = r.email && isEmail(r.email) ? normalizeEmail(r.email) : null;
    if (!email && !r.contactName) {
      noContact++;
      continue;
    }
    if (email && suppressed.has(email)) {
      out.suppressed++;
      continue;
    }
    // Deduplicate across every source and against the CRM: one person, one record.
    const dupe = email
      ? await db.prospect.findFirst({ where: { email }, select: { id: true } })
      : await db.prospect.findFirst({ where: { company: { equals: r.company, mode: "insensitive" }, contactName: { equals: r.contactName!, mode: "insensitive" } }, select: { id: true } });
    if (dupe) {
      out.duplicates++;
      continue;
    }
    if (email && (await db.lead.findFirst({ where: { email: { equals: email, mode: "insensitive" }, archivedAt: null }, select: { id: true } }))) {
      out.alreadyInCrm++;
      continue;
    }
    await db.prospect.create({ data: { company: r.company.slice(0, 200), domain: r.domain, contactName: r.contactName, title: r.title, email, country: r.country, industry: r.industry, source, campaignId, provenance: json({ provider: source, campaignId, confidence: r.confidence, by: opts.actor, at: new Date().toISOString() }) } });
    out.discovered++;
  }
  if (noContact) notes.push(`${noContact} provider record(s) without a contact were ignored`);
  out.steps.push({ key: "discover", status: "DONE", count: out.discovered, note: notes.length ? notes.join(" · ") : undefined });
  out.steps.push({ key: "dedupe", status: "DONE", count: out.duplicates + out.alreadyInCrm, note: `${out.duplicates} duplicate prospect(s), ${out.alreadyInCrm} already in the CRM` });
  out.steps.push({ key: "suppress", status: "DONE", count: out.suppressed, note: "Unsubscribed, bounced or complained addresses are never added." });
}

async function verify(campaignId: string, max: number, out: RunSummary) {
  if (!enrichmentProvider.status().connected) {
    out.steps.push({ key: "verify", status: "NOT_CONNECTED", count: 0, note: "Email verification provider (Hunter) NOT CONNECTED — prospects stay unverified and cannot qualify." });
    return;
  }
  const rows = await db.prospect.findMany({ where: { campaignId, email: { not: null }, verification: null, status: { in: ["NEW", "RESEARCHED"] } }, select: { id: true, email: true }, take: max });
  let errors = 0;
  for (const p of rows) {
    const r = await enrichmentProvider.verifyEmail(p.email!);
    if (!r.ok) {
      errors++;
      if (r.code !== "PROVIDER_ERROR" || errors >= 3) break;
      continue;
    }
    await db.prospect.update({ where: { id: p.id }, data: { verification: verificationOf(r.data.status), verifiedAt: new Date() } });
    out.verified++;
  }
  out.steps.push({ key: "verify", status: errors && !out.verified ? "ERROR" : "DONE", count: out.verified, note: errors ? `${errors} verification error(s); retried on the next run.` : undefined });
}

/** Real website engagement of the prospect's company (visitor intelligence by domain); null when there is none. */
async function intent(campaignId: string, out: RunSummary) {
  const rows = await db.prospect.findMany({ where: { campaignId, domain: { not: null }, intentScore: null }, select: { id: true, domain: true }, take: 200 });
  const domains = [...new Set(rows.map((r) => r.domain!.toLowerCase()))];
  if (!domains.length) {
    out.steps.push({ key: "intent", status: "SKIPPED", count: 0, note: "No new prospect domains to match." });
    return;
  }
  const companies = await db.visitorCompany.findMany({ where: { domain: { in: domains, mode: "insensitive" } }, select: { domain: true, visitors: { select: { intentScore: true } } } });
  const score = new Map(companies.map((c) => [c.domain!.toLowerCase(), Math.max(0, ...c.visitors.map((v) => v.intentScore))]));
  let n = 0;
  for (const r of rows) {
    const s = score.get(r.domain!.toLowerCase());
    if (s == null) continue;
    await db.prospect.update({ where: { id: r.id }, data: { intentScore: s } });
    n++;
  }
  out.steps.push({ key: "intent", status: "DONE", count: n, note: `${n} prospect compan${n === 1 ? "y has" : "ies have"} visited the website (company identification comes from the visitor intelligence provider).` });
}

async function scoreAndQualify(campaignId: string, cfg: LeadGenConfig, out: RunSummary) {
  const rows = await db.prospect.findMany({ where: { campaignId, status: "NEW" }, select: { id: true, title: true, country: true, industry: true, email: true, verification: true, provenance: true } });
  for (const p of rows) {
    const fit = icpFit(p, cfg);
    const prov = p.provenance && typeof p.provenance === "object" && !Array.isArray(p.provenance) ? (p.provenance as Record<string, unknown>) : {};
    const status = p.verification === "INVALID" ? "DISQUALIFIED" : fit.score >= cfg.minFit && p.verification === "VALID" ? "RESEARCHED" : "NEW";
    await db.prospect.update({ where: { id: p.id }, data: { fitScore: fit.score, status, provenance: json({ ...prov, fit: fit.reasons }) } });
    if (status === "RESEARCHED") out.qualified++;
    if (status === "DISQUALIFIED") out.disqualified++;
  }
  out.steps.push({ key: "score", status: "DONE", count: rows.length, note: `ICP fit = title, country, industry and verified email against this campaign's ICP.` });
  out.steps.push({ key: "qualify", status: "DONE", count: out.qualified, note: `${out.qualified} qualified (fit ≥ ${cfg.minFit} and verified email), ${out.disqualified} disqualified (invalid email).` });
}

export interface Funnel {
  discovered: number;
  withEmail: number;
  verified: number;
  invalid: number;
  duplicatesAvoided: number;
  qualified: number;
  contacted: number;
  replied: number;
  converted: number;
  meetings: number;
  opportunities: number;
  won: number;
  sources: { source: string; discovered: number; qualified: number; converted: number }[];
}

/** Funnel from real rows. With a campaign id it covers that campaign; otherwise every lead generation campaign. */
export async function leadGenFunnel(campaignId?: string | null): Promise<Funnel> {
  const where: Prisma.ProspectWhereInput = campaignId ? { campaignId } : { campaignId: { not: null } };
  const [discovered, withEmail, verified, invalid, qualified, contacted, replied, converted, bySource, qualBySource, convBySource, campaigns] = await Promise.all([
    db.prospect.count({ where }),
    db.prospect.count({ where: { ...where, email: { not: null } } }),
    db.prospect.count({ where: { ...where, verification: "VALID" } }),
    db.prospect.count({ where: { ...where, verification: "INVALID" } }),
    db.prospect.count({ where: { ...where, status: { in: ["RESEARCHED", "CONTACTED", "REPLIED", "CONVERTED"] } } }),
    db.prospect.count({ where: { ...where, status: { in: ["CONTACTED", "REPLIED", "CONVERTED"] } } }),
    db.prospect.count({ where: { ...where, status: { in: ["REPLIED", "CONVERTED"] } } }),
    db.prospect.findMany({ where: { ...where, leadId: { not: null } }, select: { leadId: true } }),
    db.prospect.groupBy({ by: ["source"], where, _count: { _all: true } }),
    db.prospect.groupBy({ by: ["source"], where: { ...where, status: { in: ["RESEARCHED", "CONTACTED", "REPLIED", "CONVERTED"] } }, _count: { _all: true } }),
    db.prospect.groupBy({ by: ["source"], where: { ...where, leadId: { not: null } }, _count: { _all: true } }),
    db.campaign.findMany({ where: campaignId ? { id: campaignId } : { leadGen: { not: Prisma.DbNull } }, select: { leadGen: true } }),
  ]);
  const leadIds = converted.map((c) => c.leadId!);
  const [meetings, opportunities, won] = leadIds.length
    ? await Promise.all([
        db.lead.count({ where: { id: { in: leadIds }, status: { in: ["MEETING", "PROPOSAL_SENT", "NEGOTIATION", "WON"] } } }),
        db.deal.count({ where: { leadId: { in: leadIds }, deletedAt: null } }),
        db.deal.count({ where: { leadId: { in: leadIds }, deletedAt: null, stage: "WON" } }),
      ])
    : [0, 0, 0];
  const n = (list: { source: string; _count: { _all: number } }[], s: string) => list.find((x) => x.source === s)?._count._all ?? 0;
  return {
    discovered,
    withEmail,
    verified,
    invalid,
    duplicatesAvoided: campaigns.reduce((a, c) => a + parseLeadGen(c.leadGen).duplicatesTotal, 0),
    qualified,
    contacted,
    replied,
    converted: leadIds.length,
    meetings,
    opportunities,
    won,
    sources: bySource.map((s) => ({ source: s.source, discovered: s._count._all, qualified: n(qualBySource, s.source), converted: n(convBySource, s.source) })).sort((a, b) => b.discovered - a.discovered),
  };
}

