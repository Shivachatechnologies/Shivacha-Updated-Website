"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { audit } from "@/lib/audit";
import { can } from "@/lib/auth/permissions";
import { authorizeAccess } from "@/lib/os/guard";
import { fail, formObject, okThen, optDate, reqText, UserError, type ActionState } from "@/lib/os/action";
import { saveMemory } from "@/lib/ai/workforce/memory";
import { integrationByKey } from "@/lib/integrations/catalog";
import { removeSecrets, storeSecret, VaultError } from "@/lib/integrations/vault";
import { testIntegration } from "@/lib/integrations/health";
import { OAUTH_TOKENS, OAuthError, revokeOAuth, selectMetaPage } from "@/lib/integrations/oauth";
import { cancelObjective, createObjective, ObjectiveError } from "./objectives";
import { seesAllObjectives } from "./access";
import { saveCompanyProfile } from "./profile";
import { DEPARTMENTS, REGIONS, TEMPLATE_KEYS, parseCompanyProfile } from "./org";
import { enrollQualified, LeadGenError, runLeadPipeline } from "./leadgen";
import { LEADGEN_SOURCES, parseLeadGen } from "./leadgen-rules";
import { requestMarketResearch } from "./research-request";
import { RESEARCH_PARAMS } from "./research-rules";
import { parseStrategy, syncPostMetrics } from "@/lib/growth/social-metrics";
import { SOCIAL_PLATFORMS } from "@/lib/growth/policy";

const F = "AI_WORKFORCE" as const;
const json = (v: unknown) => JSON.parse(JSON.stringify(v ?? null));
const wrap = (e: unknown) => (e instanceof ObjectiveError || e instanceof LeadGenError || e instanceof VaultError ? new UserError(e.message) : e);

/* ───────────────────────── CEO objectives ───────────────────────── */

export async function createObjectiveAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorizeAccess("executive:view", F);
    if (!can(user.role, "ai:execute")) throw new UserError("You need permission to direct AI employees.");
    const d = z.object({ statement: reqText(4000), title: z.preprocess((v) => (v ? v : undefined), z.string().trim().max(200).optional()), dueAt: optDate }).parse(formObject(form));
    const r = await createObjective({ statement: d.statement, title: d.title ?? null, dueAt: d.dueAt, userId: user.id });
    return okThen(`/admin/company/objectives/${r.id}`, r.existing ? "This objective was already created a moment ago." : "Objective created and planned.");
  } catch (e) {
    return fail(wrap(e), "company");
  }
}

export async function cancelObjectiveAction(id: string): Promise<ActionState> {
  try {
    const user = await authorizeAccess("executive:view", F);
    await cancelObjective(id, user.id, user.name);
    return okThen(`/admin/company/objectives/${id}`, "Objective cancelled.");
  } catch (e) {
    return fail(wrap(e), "company");
  }
}

/** A person handles an escalation or blocker addressed to people. */
export async function resolveMessageAction(id: string): Promise<ActionState> {
  try {
    const user = await authorizeAccess("ai:execute", F);
    // A person may close escalations addressed to them; executives and AI administrators may close any.
    const scope = seesAllObjectives(user.role) ? {} : { toUserId: user.id };
    const r = await db.aIWorkMessage.updateMany({ where: { id, status: "OPEN", ...scope }, data: { status: "RESOLVED", resolvedAt: new Date() } });
    if (!r.count) throw new UserError("Already resolved.");
    await audit({ userId: user.id, action: "company.message.resolved", entity: "AIWorkMessage", entityId: id });
    revalidatePath("/admin/company");
    return { ok: "Marked as handled." };
  } catch (e) {
    return fail(e, "company");
  }
}

/* ───────────────────────── configuration & governance ───────────────────────── */

export async function saveCompanyProfileAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorizeAccess("ai:configure", F);
    const o = formObject(form);
    const deps = form.getAll("departments").map(String);
    const p = parseCompanyProfile({
      name: String(o.name ?? ""),
      template: TEMPLATE_KEYS.includes(String(o.template) as never) ? String(o.template) : "SOFTWARE",
      departments: deps,
      strictApprovals: form.get("strictApprovals") === "on",
      dailyDelegationLimit: Number(o.dailyDelegationLimit),
      objectiveTaskLimit: Number(o.objectiveTaskLimit),
    });
    await saveCompanyProfile(p);
    await audit({ userId: user.id, action: "company.profile.saved", metadata: { ...p } });
    revalidatePath("/admin/company", "layout");
    return { ok: "Company configuration saved." };
  } catch (e) {
    return fail(e, "company");
  }
}

export async function saveDepartmentBudgetAction(key: string, _: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorizeAccess("ai:configure", F);
    if (!DEPARTMENTS.some((d) => d.key === key)) throw new UserError("Unknown department.");
    const raw = String(form.get("limit") ?? "").trim();
    if (raw && !/^\d{1,8}(\.\d{1,2})?$/.test(raw)) throw new UserError("Enter a USD amount or leave blank for no limit.");
    await db.aIDepartment.update({ where: { key }, data: { monthlyCostLimit: raw || null } });
    await audit({ userId: user.id, action: "company.department.budget", entity: "AIDepartment", entityId: key, metadata: { limit: raw || null } });
    revalidatePath("/admin/company/settings");
    return { ok: raw ? `Monthly AI limit set to $${raw}.` : "Limit removed." };
  } catch (e) {
    return fail(e, "company");
  }
}

/** Company, department or region memory written by a person (never secrets — redacted on save). */
export async function addCompanyMemoryAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorizeAccess("ai:configure", F);
    const d = z.object({ scope: z.enum(["COMPANY", "DEPARTMENT", "REGION"]), scopeKey: z.string().trim().max(40).optional(), kind: z.enum(["INSTRUCTION", "PREFERENCE", "KNOWLEDGE"]), title: reqText(200), content: reqText(4000) }).parse(formObject(form));
    if (d.scope === "DEPARTMENT" && !DEPARTMENTS.some((x) => x.key === d.scopeKey)) throw new UserError("Choose a department.");
    if (d.scope === "REGION" && !REGIONS.some((x) => x.key === d.scopeKey)) throw new UserError("Choose a region.");
    await saveMemory({ agentSlug: "company", kind: d.kind, scope: d.scope, scopeKey: d.scope === "COMPANY" ? null : d.scopeKey, title: d.title, content: d.content, createdById: user.id, pinned: true });
    await audit({ userId: user.id, action: "company.memory.added", metadata: { scope: d.scope, scopeKey: d.scopeKey, title: d.title } });
    revalidatePath("/admin/company/settings");
    return { ok: "Saved to memory." };
  } catch (e) {
    return fail(e, "company");
  }
}

export async function deleteCompanyMemoryAction(id: string): Promise<ActionState> {
  try {
    const user = await authorizeAccess("ai:configure", F);
    await db.aIEmployeeMemory.deleteMany({ where: { id, scope: { in: ["COMPANY", "DEPARTMENT", "REGION"] } } });
    await audit({ userId: user.id, action: "company.memory.deleted", entity: "AIEmployeeMemory", entityId: id });
    revalidatePath("/admin/company/settings");
    return { ok: "Removed." };
  } catch (e) {
    return fail(e, "company");
  }
}

/* ───────────────────────── lead generation (Growth) ───────────────────────── */

const listField = (form: FormData, k: string) => String(form.get(k) ?? "").split(/[,\n]/).map((x) => x.trim()).filter(Boolean).slice(0, 100);

export async function saveLeadCampaignAction(id: string | null, _: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorizeAccess("growth:manage", "GROWTH");
    const d = z.object({ name: reqText(200), market: z.string().trim().max(200).optional(), icp: z.string().trim().max(4000).optional(), offer: z.string().trim().max(4000).optional(), dailyLeadTarget: z.coerce.number().int().min(1).max(10_000), totalTarget: z.preprocess((v) => (v === "" || v == null ? undefined : v), z.coerce.number().int().min(1).max(1_000_000).optional()), minFit: z.coerce.number().int().min(0).max(100).default(60), mode: z.enum(["MANUAL", "AUTONOMOUS"]), regionKey: z.string().trim().max(10).optional() }).parse(formObject(form));
    const sources = form.getAll("sources").map(String).filter((s) => s in LEADGEN_SOURCES);
    const existing = id ? await db.campaign.findUnique({ where: { id }, select: { leadGen: true } }) : null;
    const prev = parseLeadGen(existing?.leadGen);
    const cfg = { ...prev, sources: sources.length ? sources : prev.sources, titles: listField(form, "titles"), countries: listField(form, "countries"), domains: listField(form, "domains"), industries: listField(form, "industries"), totalTarget: d.totalTarget ?? null, mode: d.mode, minFit: d.minFit };
    const clean = parseLeadGen(cfg);
    const data = { name: d.name, market: d.market || null, icp: d.icp || null, offer: d.offer || null, dailyLeadTarget: d.dailyLeadTarget, regionKey: REGIONS.some((r) => r.key === d.regionKey) ? d.regionKey : null, leadGen: json({ ...clean, lastRun: prev.lastRun, duplicatesTotal: prev.duplicatesTotal }) };
    const c = id ? await db.campaign.update({ where: { id }, data }) : await db.campaign.create({ data: { ...data, channel: "OTHER", status: "ACTIVE", ownerId: user.id, objective: "Lead generation" } });
    await audit({ userId: user.id, action: id ? "company.leadgen.updated" : "company.leadgen.created", entity: "Campaign", entityId: c.id, metadata: { mode: clean.mode, dailyLeadTarget: d.dailyLeadTarget, sources: clean.sources } });
    return okThen(`/admin/marketing/leads/${c.id}`, id ? "Campaign saved." : "Lead campaign created.");
  } catch (e) {
    return fail(e, "company");
  }
}

export async function runLeadPipelineAction(id: string): Promise<ActionState> {
  try {
    const user = await authorizeAccess("growth:manage", "GROWTH");
    const r = await runLeadPipeline(id, { actor: user.id });
    const blocked = r.steps.filter((s) => s.status === "NOT_CONNECTED").map((s) => s.key);
    return okThen(`/admin/marketing/leads/${id}`, `Run finished: ${r.discovered} discovered, ${r.verified} verified, ${r.qualified} qualified${blocked.length ? ` · NOT CONNECTED: ${blocked.join(", ")}` : ""}.`);
  } catch (e) {
    return fail(wrap(e), "company");
  }
}

/* ───────────────────────── market intelligence ───────────────────────── */

export async function requestResearchAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorizeAccess("growth:manage", "GROWTH");
    if (!can(user.role, "ai:execute") || !can(user.role, "leads:view")) throw new UserError("You need permission to direct the AI Market Intelligence team.");
    const params = Object.fromEntries(RESEARCH_PARAMS.map((k) => [k, String(form.get(k) ?? "").trim().slice(0, 200)]).filter(([, v]) => v));
    const r = await requestMarketResearch({ params, title: String(form.get("title") ?? "").trim() || undefined, userId: user.id });
    return okThen(`/admin/marketing/market/${r.id}`, "Market research requested.");
  } catch (e) {
    return fail(e instanceof Error && /Choose at least one/.test(e.message) ? new UserError(e.message) : e, "company");
  }
}

/* ───────────────────────── API & Integrations Center ───────────────────────── */

export async function connectIntegrationAction(key: string, _: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorizeAccess("integrations:manage", "INTEGRATIONS");
    const def = integrationByKey(key);
    if (!def || !def.vault) throw new UserError("This integration cannot be connected from the UI.");
    let saved = 0;
    for (const f of def.fields) {
      const v = String(form.get(f.name) ?? "").trim();
      if (!v) continue;
      await storeSecret(f.name, key, v, user.id);
      saved++;
    }
    if (!saved) throw new UserError("Enter at least one value.");
    // Values are never written to the audit log — only which credential names changed.
    await audit({ userId: user.id, action: "integration.credentials.saved", entity: "Integration", entityId: key, metadata: { fields: def.fields.filter((f) => String(form.get(f.name) ?? "").trim()).map((f) => f.name) } });
    const t = await testIntegration(key);
    return okThen("/admin/integrations/connect", `Saved (encrypted). Test: ${t.state.replace("_", " ").toLowerCase()} — ${t.message}`);
  } catch (e) {
    return fail(wrap(e), "integrations");
  }
}

export async function testIntegrationAction(key: string): Promise<ActionState> {
  try {
    const user = await authorizeAccess("integrations:manage", "INTEGRATIONS");
    const t = await testIntegration(key);
    await audit({ userId: user.id, action: "integration.tested", entity: "Integration", entityId: key, metadata: { state: t.state } });
    return okThen("/admin/integrations/connect", `${integrationByKey(key)?.name ?? key}: ${t.message}`);
  } catch (e) {
    return fail(e, "integrations");
  }
}

export async function disconnectIntegrationAction(key: string): Promise<ActionState> {
  try {
    const user = await authorizeAccess("integrations:manage", "INTEGRATIONS");
    const def = integrationByKey(key);
    if (!def || !def.vault) throw new UserError("Nothing stored for this integration.");
    // Shared credentials (e.g. the Meta page token used by Facebook and Instagram) are removed for both.
    // Disconnecting an OAuth app first asks the provider to revoke the sign-in, then deletes every token it stored.
    const app = def.oauth && def.category === "OAuth apps" ? def.oauth : null;
    const revoke = app ? await revokeOAuth(app) : null;
    await removeSecrets([...def.fields.map((f) => f.name), ...(app ? OAUTH_TOKENS[app] : [])]);
    await db.integration.deleteMany({ where: { key: { in: [`center:${key}`, ...(app ? [`oauth:${app}`] : [])] } } });
    await audit({ userId: user.id, action: "integration.credentials.removed", entity: "Integration", entityId: key, metadata: revoke ? { providerRevoked: revoke.revoked } : undefined });
    return okThen("/admin/integrations/connect", `${def.name}: stored credentials removed.${revoke ? ` ${revoke.message}` : ""} Environment variables (if any) are unchanged.`);
  } catch (e) {
    return fail(wrap(e), "integrations");
  }
}

/** Chooses which Facebook Page (and its Instagram account) the Meta sign-in should use. */
export async function selectMetaPageAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorizeAccess("integrations:manage", "INTEGRATIONS");
    const name = await selectMetaPage(String(form.get("pageId") ?? ""), user.id);
    await audit({ userId: user.id, action: "integration.meta.page_selected", entity: "Integration", entityId: "meta" });
    await testIntegration("facebook").catch(() => null);
    return okThen("/admin/integrations/connect", `Page "${name}" selected.`);
  } catch (e) {
    return fail(e instanceof OAuthError ? new UserError(e.message) : e, "integrations");
  }
}

/** OUTREACH: a person enrols the campaign's qualified prospects in an outbound sequence. */
export async function enrollQualifiedAction(campaignId: string, _: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorizeAccess("growth:manage", "GROWTH");
    const r = await enrollQualified(campaignId, String(form.get("sequenceId") ?? ""), { actor: user.id, max: Number(form.get("max")) || 50 });
    return okThen(`/admin/marketing/leads/${campaignId}`, `${r.enrolled} prospect(s) enrolled in "${r.sequence}"${r.skipped ? `, ${r.skipped} skipped (already enrolled or suppressed)` : ""}${r.active ? "" : " — the sequence is inactive, so nothing is sent until it is activated"}.`);
  } catch (e) {
    return fail(wrap(e), "company");
  }
}

/* ───────────────────────── social strategy & performance ───────────────────────── */

export async function saveSocialStrategyAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorizeAccess("growth:manage", "GROWTH");
    const cadence = Object.fromEntries(SOCIAL_PLATFORMS.map((p) => [p, Number(form.get(`cad_${p}`))]));
    const v = parseStrategy({ pillars: String(form.get("pillars") ?? "").split(/\n|,/).map((x) => x.trim()).filter(Boolean), audience: String(form.get("audience") ?? ""), tone: String(form.get("tone") ?? ""), cadence });
    await db.setting.upsert({ where: { key: "socialStrategy" }, update: { value: json(v) }, create: { key: "socialStrategy", value: json(v) } });
    await audit({ userId: user.id, action: "growth.social.strategy_saved" });
    return okThen("/admin/marketing/social/performance", "Social strategy saved.");
  } catch (e) {
    return fail(e, "growth");
  }
}

export async function syncSocialMetricsAction(): Promise<ActionState> {
  try {
    await authorizeAccess("growth:manage", "GROWTH");
    const r = await syncPostMetrics(100);
    return okThen("/admin/marketing/social/performance", `Synced ${r.synced} post(s)${r.skipped.length ? ` · NOT CONNECTED: ${r.skipped.join(", ")}` : ""}${r.errors.length ? ` · ${r.errors.length} error(s): ${r.errors[0]}` : ""}.`);
  } catch (e) {
    return fail(e, "growth");
  }
}

/* ───────────────────────── internal systems (recruiting, procurement, compliance, risk) ───────────────────────── */

const INTERNAL = "/admin/company/internal";
const opt = (v: FormDataEntryValue | null, max = 500) => {
  const s = String(v ?? "").trim();
  return s ? s.slice(0, max) : null;
};
const req = (v: FormDataEntryValue | null, max = 200) => {
  const s = String(v ?? "").trim();
  if (!s) throw new UserError("Required fields are missing.");
  return s.slice(0, max);
};

export async function saveJobOpeningAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorizeAccess("employees:manage", F);
    const j = await db.jobOpening.create({ data: { title: req(form.get("title")), departmentKey: opt(form.get("departmentKey"), 40), location: opt(form.get("location"), 120), employmentType: opt(form.get("employmentType"), 40), description: opt(form.get("description"), 8000), status: "OPEN", ownerId: user.id } });
    await audit({ userId: user.id, action: "company.recruiting.role_created", entity: "JobOpening", entityId: j.id });
    return okThen(`${INTERNAL}?tab=recruiting`, "Role opened.");
  } catch (e) {
    return fail(e, "company");
  }
}

export async function saveCandidateAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorizeAccess("employees:manage", F);
    const c = await db.candidate.create({ data: { name: req(form.get("name")), email: opt(form.get("email"), 200), phone: opt(form.get("phone"), 40), source: opt(form.get("source"), 80), jobId: opt(form.get("jobId"), 40), notes: opt(form.get("notes"), 8000), resumeText: opt(form.get("resumeText"), 40_000), createdById: user.id } });
    await audit({ userId: user.id, action: "company.recruiting.candidate_added", entity: "Candidate", entityId: c.id });
    return okThen(`${INTERNAL}?tab=recruiting`, "Candidate added.");
  } catch (e) {
    return fail(e, "company");
  }
}

const CANDIDATE_STAGES = ["APPLIED", "SCREENING", "INTERVIEW", "OFFER", "HIRED", "REJECTED", "WITHDRAWN"];
/** Hiring decisions are human: only a person moves a candidate between stages. */
export async function setCandidateStageAction(id: string, stage: string): Promise<ActionState> {
  try {
    const user = await authorizeAccess("employees:manage", F);
    if (!CANDIDATE_STAGES.includes(stage)) throw new UserError("Invalid stage.");
    await db.candidate.update({ where: { id }, data: { stage } });
    await audit({ userId: user.id, action: "company.recruiting.stage", entity: "Candidate", entityId: id, metadata: { stage } });
    return okThen(`${INTERNAL}?tab=recruiting`, `Moved to ${stage.toLowerCase()}.`);
  } catch (e) {
    return fail(e, "company");
  }
}

export async function saveVendorAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorizeAccess("finance:manage", F);
    const risk = String(form.get("riskLevel") ?? "LOW");
    const v = await db.vendor.create({ data: { name: req(form.get("name")), category: opt(form.get("category"), 80), contactName: opt(form.get("contactName"), 120), email: opt(form.get("email"), 200), website: opt(form.get("website"), 300), riskLevel: ["LOW", "MEDIUM", "HIGH"].includes(risk) ? risk : "LOW", notes: opt(form.get("notes"), 4000) } });
    await audit({ userId: user.id, action: "company.procurement.vendor_added", entity: "Vendor", entityId: v.id });
    return okThen(`${INTERNAL}?tab=procurement`, "Vendor added (under review).");
  } catch (e) {
    return fail(e, "company");
  }
}

export async function submitPurchaseRequestAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorizeAccess("finance:view", F);
    const amount = String(form.get("amount") ?? "").trim();
    if (amount && !/^\d{1,12}(\.\d{1,2})?$/.test(amount)) throw new UserError("Enter a valid amount.");
    const r = await db.purchaseRequest.create({ data: { title: req(form.get("title")), vendorId: opt(form.get("vendorId"), 40), amount: amount || null, currency: (opt(form.get("currency"), 3) ?? "USD").toUpperCase(), justification: opt(form.get("justification"), 4000), status: "SUBMITTED", requestedById: user.id } });
    await audit({ userId: user.id, action: "company.procurement.request_submitted", entity: "PurchaseRequest", entityId: r.id, metadata: { amount, currency: r.currency } });
    return okThen(`${INTERNAL}?tab=procurement`, "Purchase request submitted for approval.");
  } catch (e) {
    return fail(e, "company");
  }
}

const PR_NEXT: Record<string, string[]> = { SUBMITTED: ["APPROVED", "REJECTED", "CANCELLED"], APPROVED: ["ORDERED", "CANCELLED"], ORDERED: ["RECEIVED"] };
/** Procurement decisions are human; the system never buys or pays. */
export async function decidePurchaseRequestAction(id: string, to: string): Promise<ActionState> {
  try {
    const user = await authorizeAccess("finance:manage", F);
    const r = await db.purchaseRequest.findUnique({ where: { id } });
    if (!r) throw new UserError("Request not found.");
    if (!(PR_NEXT[r.status] ?? []).includes(to)) throw new UserError(`A ${r.status.toLowerCase()} request cannot become ${to.toLowerCase()}.`);
    if (to === "APPROVED" && r.requestedById === user.id) throw new UserError("You cannot approve your own request.");
    await db.purchaseRequest.update({ where: { id }, data: { status: to, decidedById: ["APPROVED", "REJECTED"].includes(to) ? user.id : r.decidedById, decidedAt: ["APPROVED", "REJECTED"].includes(to) ? new Date() : r.decidedAt } });
    await audit({ userId: user.id, action: "company.procurement.request_status", entity: "PurchaseRequest", entityId: id, metadata: { from: r.status, to } });
    return okThen(`${INTERNAL}?tab=procurement`, `Request ${to.toLowerCase()}.`);
  } catch (e) {
    return fail(e, "company");
  }
}

export async function saveComplianceItemAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorizeAccess("contracts:manage", F);
    const due = String(form.get("dueDate") ?? "").trim();
    const c = await db.complianceItem.create({ data: { title: req(form.get("title")), framework: opt(form.get("framework"), 40), ownerSlug: opt(form.get("ownerSlug"), 40), dueDate: /^\d{4}-\d{2}-\d{2}$/.test(due) ? new Date(`${due}T00:00:00Z`) : null, notes: opt(form.get("notes"), 4000), ownerId: user.id } });
    await audit({ userId: user.id, action: "company.compliance.item_added", entity: "ComplianceItem", entityId: c.id });
    return okThen(`${INTERNAL}?tab=compliance`, "Compliance item added.");
  } catch (e) {
    return fail(e, "company");
  }
}

export async function setComplianceStatusAction(id: string, status: string): Promise<ActionState> {
  try {
    const user = await authorizeAccess("contracts:manage", F);
    if (!["OPEN", "IN_PROGRESS", "DONE", "NOT_APPLICABLE"].includes(status)) throw new UserError("Invalid status.");
    await db.complianceItem.update({ where: { id }, data: { status } });
    await audit({ userId: user.id, action: "company.compliance.status", entity: "ComplianceItem", entityId: id, metadata: { status } });
    return okThen(`${INTERNAL}?tab=compliance`, "Updated.");
  } catch (e) {
    return fail(e, "company");
  }
}

export async function saveRiskAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorizeAccess("contracts:manage", F);
    const n = (k: string) => Math.max(1, Math.min(5, Number(form.get(k)) || 3));
    const r = await db.riskItem.create({ data: { title: req(form.get("title")), category: opt(form.get("category"), 60), likelihood: n("likelihood"), impact: n("impact"), ownerSlug: opt(form.get("ownerSlug"), 40), mitigation: opt(form.get("mitigation"), 4000) } });
    await audit({ userId: user.id, action: "company.risk.added", entity: "RiskItem", entityId: r.id });
    return okThen(`${INTERNAL}?tab=risk`, "Risk added.");
  } catch (e) {
    return fail(e, "company");
  }
}

export async function setRiskStatusAction(id: string, status: string): Promise<ActionState> {
  try {
    const user = await authorizeAccess("contracts:manage", F);
    if (!["OPEN", "MITIGATING", "ACCEPTED", "CLOSED"].includes(status)) throw new UserError("Invalid status.");
    await db.riskItem.update({ where: { id }, data: { status } });
    await audit({ userId: user.id, action: "company.risk.status", entity: "RiskItem", entityId: id, metadata: { status } });
    return okThen(`${INTERNAL}?tab=risk`, "Updated.");
  } catch (e) {
    return fail(e, "company");
  }
}
