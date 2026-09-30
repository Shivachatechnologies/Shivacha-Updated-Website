/**
 * AI company unit tests (pure, no database): organisation integrity and least privilege, delegation rules, regions,
 * objective understanding, lead scoring, research sourcing rules, governance, memory redaction, vault whitelist.
 *
 *   npm run test:company
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { AGENTS, ALL_AGENTS, agentBySlug } from "../../lib/ai/catalog";
import { getTool } from "../../lib/ai/tools";
import { CORE_PLACEMENT, DEFAULT_PROFILE, DEPARTMENTS, ORG_EMPLOYEES, REGIONS, canDelegate, chainOf, employeeCodes, hasCycle, parseCompanyProfile, placementOf, regionOf, riskTier, subtreeOf, type ManagerMap } from "../../lib/company/org";
import { detectPlaybook, detectRegion, parseTarget, planFor } from "../../lib/company/objective-rules";
import { icpFit, parseLeadGen, verificationOf } from "../../lib/company/leadgen-rules";
import { checkFinding, looksStatistical } from "../../lib/company/research-rules";
import { delegationKey, isTransientError, retryDelayMs } from "../../lib/company/delegation";
import { redactSecrets } from "../../lib/ai/workforce/memory";
import { INTEGRATIONS, VAULT_NAMES, maskHint } from "../../lib/integrations/catalog";
import { progressFrom } from "../../lib/company/objective-status";

const managers: ManagerMap = new Map(ALL_AGENTS.map((a) => [a.slug, placementOf(a.slug)!.manager]));

test("organisation: 12 core employees unchanged, 48 added, 60 total with unique slugs", () => {
  assert.equal(AGENTS.length, 12);
  assert.equal(ORG_EMPLOYEES.length, 48);
  assert.equal(ALL_AGENTS.length, 60);
  assert.equal(new Set(ALL_AGENTS.map((a) => a.slug)).size, 60);
  for (const a of AGENTS) assert.ok(CORE_PLACEMENT[a.slug], `${a.slug} is placed in the hierarchy`);
  assert.equal(new Set(employeeCodes(AGENTS.map((a) => a.slug)).values()).size, 60);
});

test("organisation: valid reporting lines, no cycles, one Chief of Staff under the human CEO", () => {
  assert.ok(!hasCycle(managers));
  for (const [s, m] of managers) if (m) assert.ok(managers.has(m), `${s} reports to unknown ${m}`);
  assert.deepEqual([...managers].filter(([, m]) => m === null).map(([s]) => s), ["ceo"]);
  for (const d of DEPARTMENTS) assert.ok(agentBySlug(d.head), `${d.key} head ${d.head} exists`);
  for (const r of REGIONS) assert.equal(placementOf(r.leader)?.region, r.key);
  for (const s of ALL_AGENTS.map((a) => a.slug)) assert.ok(chainOf(s, managers).length === 0 ? s === "ceo" : chainOf(s, managers).at(-1) === "ceo", `${s} reaches the Chief of Staff`);
  const levels = ALL_AGENTS.map((a) => placementOf(a.slug)!.level);
  assert.equal(levels.filter((l) => l === "EXECUTIVE").length, 9);
  assert.ok(levels.filter((l) => l === "SPECIALIST").length >= 20);
  const cycle: ManagerMap = new Map([["a", "b"], ["b", "a"]]);
  assert.ok(hasCycle(cycle));
});

test("least privilege: every tool exists, nobody gets every tool, no growth-control tool, external email always needs approval", () => {
  const all = new Set(ALL_AGENTS.flatMap((a) => a.tools));
  for (const a of ALL_AGENTS) {
    for (const t of a.tools) assert.ok(getTool(t), `${a.slug} → ${t}`);
    assert.ok(a.tools.length < all.size / 2, `${a.slug} does not get most company tools`);
    assert.ok(!a.tools.some((t) => /growth.*(settings|control|kill)/i.test(t)));
  }
  for (const a of ORG_EMPLOYEES) if (a.tools.includes("sendEmail")) assert.equal(getTool("sendEmail")!.alwaysApprove, true);
  // Engineers cannot touch data beyond projects/knowledge; finance staff cannot write financial records.
  for (const s of ["frontend-engineer", "backend-engineer", "devops-engineer"]) assert.ok(agentBySlug(s)!.tools.every((t) => getTool(t)!.kind !== "write"), s);
  for (const s of ["cfo", "billing-specialist", "financial-analyst"]) assert.ok(agentBySlug(s)!.tools.every((t) => getTool(t)!.kind !== "write"), s);
  assert.equal(riskTier(getTool("sendEmail")!), "HIGH");
  assert.equal(riskTier(getTool("runLeadPipeline")!), "MEDIUM");
  assert.equal(riskTier(getTool("draftSocialPost")!), "MEDIUM", "stored drafts are mutations");
  assert.equal(riskTier(getTool("getOrgChart")!), "LOW");
  for (const a of ORG_EMPLOYEES) assert.ok(a.limits && a.limits.length, `${a.slug} states what it cannot do`);
});

test("delegation rules: down the org chart only; help requests may go to peers; never upward", () => {
  assert.ok(subtreeOf("cro", managers).has("sdr"));
  assert.ok(canDelegate("ceo", "sdr", managers));
  assert.ok(canDelegate("cro", "sales-director", managers));
  assert.ok(!canDelegate("cro", "cfo", managers), "not across departments");
  assert.ok(!canDelegate("sdr", "sales-director", managers), "not upward");
  assert.ok(!canDelegate("sdr", "sdr", managers));
  assert.ok(!canDelegate("sdr", "proposal", managers), "peers only via help requests");
  assert.ok(canDelegate("sdr", "proposal", managers, "HELP_REQUEST"));
  assert.ok(!canDelegate("sdr", "cfo", managers, "HELP_REQUEST"));
  assert.equal(delegationKey("t1", "cmo", "Offer  Plan"), delegationKey("t1", "cmo", "offer plan"), "idempotency key ignores case and spacing");
  assert.notEqual(delegationKey("t1", "cmo", "a"), delegationKey("t2", "cmo", "a"));
});

test("regions: countries map to regions; codes only when written as codes", () => {
  assert.equal(regionOf("United States"), "na");
  assert.equal(regionOf("UAE"), "mena");
  assert.equal(regionOf("India"), "india");
  assert.equal(regionOf("Germany"), "eu");
  assert.equal(regionOf("Atlantis"), null);
  assert.equal(regionOf(null), null);
  assert.equal(detectRegion("Enter the UAE fintech market"), "mena");
  assert.equal(detectRegion("Find 100 qualified US fintech prospects"), "na");
  assert.equal(detectRegion("Get us more customers"), null, "the word 'us' is not the US");
  assert.equal(detectRegion("Improve IT services"), null, "IT is not Italy");
  assert.equal(detectRegion("Grow in Europe"), "eu");
});

test("objective understanding: playbook, target and plan for the six example objectives", () => {
  const cases: [string, string, string | null, number | null][] = [
    ["Generate $250,000 revenue this month.", "REVENUE", "revenue_usd_month", 250000],
    ["Get 100 qualified international leads per day.", "LEAD_GENERATION", "qualified_leads_per_day", 100],
    ["Enter the UAE fintech market.", "MARKET_ENTRY", null, null],
    ["Launch our SaaS product.", "PRODUCT_LAUNCH", null, null],
    ["Increase sales pipeline.", "PIPELINE", null, null],
    ["Reduce project delivery delays.", "DELIVERY", null, null],
    ["Improve how we answer partner enquiries", "GENERAL", null, null],
  ];
  for (const [text, pb, metric, value] of cases) {
    const p = detectPlaybook(text);
    assert.equal(p, pb, text);
    const t = parseTarget(text, p);
    assert.equal(t?.metric ?? null, metric, text);
    assert.equal(t?.value ?? null, value, text);
  }
  const plan = planFor("LEAD_GENERATION", "x", null);
  assert.deepEqual(plan.map((s) => s.owner), ["intel-director", "cmo", "leadgen-director", "sdr", "content-manager", "social-manager", "campaign-manager", "revenue-analyst", "growth-director"]);
  // Phase 35: the growth loop covers social and paid media, and ends in an optimisation review of real results.
  assert.deepEqual(plan.find((s) => s.key === "optimize")?.after, ["measure", "social", "ads"]);
  assert.match(plan.find((s) => s.key === "ads")!.instructions, /reportBlocker/, "no connected ad account → blocker, never planned spend");
  for (const pb of ["LEAD_GENERATION", "MARKET_ENTRY", "REVENUE", "PIPELINE", "DELIVERY", "PRODUCT_LAUNCH"] as const) {
    const stages = planFor(pb, "x", "mena");
    const keys = new Set(stages.map((s) => s.key));
    for (const s of stages) {
      assert.ok(agentBySlug(s.owner), `${pb}: owner ${s.owner} exists`);
      for (const a of s.after ?? []) assert.ok(keys.has(a), `${pb}: ${s.key} depends on known stage ${a}`);
    }
  }
  assert.ok(planFor("MARKET_ENTRY", "x", "mena").some((s) => s.owner === "region-mena"), "regional director joins market entry");
  assert.equal(planFor("GENERAL", "x", null).length, 0, "general objectives are planned by the Chief of Staff");
});

test("lead scoring: transparent ICP fit, verification mapping, config parsing", () => {
  const icp = { titles: ["CTO"], countries: ["United States"], industries: ["fintech"] };
  assert.equal(icpFit({ title: "CTO", country: "United States", industry: "Fintech", email: "a@b.co", verification: "VALID" }, icp).score, 100);
  assert.equal(icpFit({ title: "Intern", country: "Germany", industry: "Retail", email: "a@b.co", verification: "VALID" }, icp).score, 20);
  assert.equal(icpFit({ title: "CTO", country: null, industry: null, email: null, verification: null }, { titles: [], countries: [], industries: [] }).score, 0, "nothing to match → only the email criterion, unmet");
  assert.equal(verificationOf("valid"), "VALID");
  assert.equal(verificationOf("invalid"), "INVALID");
  assert.equal(verificationOf("accept_all"), "RISKY");
  assert.equal(verificationOf("whatever"), "UNKNOWN");
  const c = parseLeadGen({ sources: ["apollo", "scraper"], domains: ["https://Acme.com/about", "bad domain"], mode: "AUTONOMOUS", minFit: 500 });
  assert.deepEqual(c.sources, ["apollo"], "unknown sources are dropped");
  assert.deepEqual(c.domains, ["acme.com"]);
  assert.equal(c.mode, "AUTONOMOUS");
  assert.equal(c.minFit, 60, "out-of-range values fall back");
  assert.equal(parseLeadGen(null).mode, "MANUAL");
});

test("research rules: statistics need a real source; labels are enforced", () => {
  assert.ok(looksStatistical("The market grows 25% a year"));
  assert.ok(looksStatistical("worth $4.2 billion"));
  assert.ok(!looksStatistical("Buyers value compliance"));
  assert.match(checkFinding({ section: "opportunity", statement: "The market grows 25% a year", label: "INFERENCE" })!, /source/);
  assert.match(checkFinding({ section: "opportunity", statement: "The market grows 25% a year", label: "SOURCE" })!, /sourceUrl/);
  assert.match(checkFinding({ section: "opportunity", statement: "The market grows 25% a year", label: "SOURCE", sourceUrl: "javascript:alert(1)" })!, /sourceUrl/);
  assert.equal(checkFinding({ section: "opportunity", statement: "The market grows 25% a year", label: "SOURCE", sourceUrl: "https://example.com/r" }), null);
  assert.equal(checkFinding({ section: "icp", statement: "Most won deals are fintech", label: "FACT", sourceUrl: "/admin/reports/deals" }), null);
  assert.match(checkFinding({ section: "nope", statement: "Something long enough", label: "FACT" })!, /section/);
});

test("governance & recovery: company profile parsing, transient error detection, bounded backoff", () => {
  const p = parseCompanyProfile({ template: "AGENCY", departments: ["marketing", "bogus"], strictApprovals: true, dailyDelegationLimit: -5 });
  assert.equal(p.template, "AGENCY");
  assert.deepEqual(p.departments.sort(), ["executive", "marketing"], "executive always on; unknown dropped");
  assert.equal(p.strictApprovals, true);
  assert.equal(p.dailyDelegationLimit, DEFAULT_PROFILE.dailyDelegationLimit);
  assert.equal(parseCompanyProfile(undefined).name, "Shivacha Technologies", "Shivacha's configuration is the default");
  assert.ok(isTransientError("AI provider rate limit reached. Try again shortly."));
  assert.ok(isTransientError("AI provider is temporarily unavailable."));
  assert.ok(isTransientError("AI provider error (529)."));
  assert.ok(!isTransientError("AI provider rejected the API key."));
  assert.ok(!isTransientError("Permission denied"));
  assert.equal(retryDelayMs(1), 2 * 60_000);
  assert.equal(retryDelayMs(10), 60 * 60_000, "capped at one hour");
  assert.deepEqual(progressFrom([{ status: "DONE" }, { status: "FAILED" }, { status: "QUEUED" }, { status: "WAITING" }]).pct, 50);
});

test("security: secrets never enter memory; the vault accepts only catalogued credential names", () => {
  const r = redactSecrets("key sk-ant-api03-abcdefghijklmnopqrstuvwxyz and password: hunter2 and Bearer abcdefghijklmnopqrstuv and ghp_abcdefghijklmnopqrstuvwxyz123456");
  assert.doesNotMatch(r, /abcdefghijklmnopqrstuvwxyz|hunter2/);
  assert.equal(redactSecrets("Plain business note."), "Plain business note.");
  for (const bad of ["DATABASE_URL", "APP_ENCRYPTION_KEY", "AUTH_SECRET", "CRON_SECRET", "SMTP_PASS"]) assert.ok(!VAULT_NAMES.has(bad), `${bad} can never be stored or overridden from the UI`);
  assert.ok(VAULT_NAMES.has("HUNTER_API_KEY") && VAULT_NAMES.has("ANTHROPIC_API_KEY"));
  assert.equal(maskHint("abcdef1234"), "••••1234");
  // Phase 34: ad platforms have real adapters, but spend is never autonomous by default and always approval-gated.
  for (const i of INTEGRATIONS.filter((x) => x.category === "Advertising")) assert.ok(i.support === "SUPPORTED" && i.oauth, `${i.name}: real adapter behind OAuth`);
  for (const t of ["launchAdCampaign", "changeAdBudget", "proposeAdCampaign"]) assert.equal(getTool(t)!.alwaysApprove, true, `${t} always needs a person`);
  assert.equal(getTool("launchAdCampaign")!.risk, "CRITICAL");
  assert.ok(!ORG_EMPLOYEES.some((e) => e.tools.includes("launchAdCampaign")), "no AI employee can launch ads directly");
});
