import { REGIONS } from "./org";

/**
 * Objective understanding (pure): which playbook fits a CEO objective, the measurable target it states, and the
 * region it names. Playbooks are deterministic decompositions into real tasks for the right AI owners; anything that
 * does not match a playbook is planned by the Chief of Staff with delegation tools.
 */

export const PLAYBOOKS = {
  LEAD_GENERATION: "Lead generation",
  MARKET_ENTRY: "Market entry",
  REVENUE: "Revenue",
  PIPELINE: "Sales pipeline",
  DELIVERY: "Delivery performance",
  PRODUCT_LAUNCH: "Product launch",
  GENERAL: "General (Chief of Staff plans it)",
} as const;
export type Playbook = keyof typeof PLAYBOOKS;

export function detectPlaybook(text: string): Playbook {
  const t = text.toLowerCase();
  if (/\blaunch\b[^.]*\b(product|saas|app|platform|offering|service)\b/.test(t)) return "PRODUCT_LAUNCH";
  if (/\b(enter|expand (in)?to|break into|go into|launch in|entry into)\b[^.]*\bmarket\b|\bmarket entry\b/.test(t)) return "MARKET_ENTRY";
  if (/\b(leads?|prospects?)\b/.test(t) && /\b(get|generate|find|source|acquire|per day|a day|daily|per week|qualified)\b/.test(t)) return "LEAD_GENERATION";
  if (/\b(project|delivery|deliveries|deadline|milestone)s?\b[^.]*\b(delay|delays|late|slip|overdue|on time)\b|\breduce\b[^.]*\bdelays?\b/.test(t)) return "DELIVERY";
  if (/\brevenue\b|\bbookings\b|\b(arr|mrr)\b|[$€£₹]\s?\d/.test(t)) return "REVENUE";
  if (/\bpipeline\b|\bmore (deals|opportunities)\b/.test(t)) return "PIPELINE";
  return "GENERAL";
}

export interface Target {
  metric: string;
  value: number;
}

const num = (s: string) => {
  const m = s.replace(/,/g, "").match(/(\d+(?:\.\d+)?)\s*(k|m|mn|million|thousand|lakh|crore)?/i);
  if (!m) return null;
  const mult: Record<string, number> = { k: 1e3, thousand: 1e3, m: 1e6, mn: 1e6, million: 1e6, lakh: 1e5, crore: 1e7 };
  return Number(m[1]) * (m[2] ? mult[m[2].toLowerCase()] : 1);
};

/** The measurable target stated in the objective, if any. It is a target — never a promise. */
export function parseTarget(text: string, playbook: Playbook): Target | null {
  const t = text.replace(/,/g, "");
  const perDay = t.match(/(\d+(?:\.\d+)?\s*(?:k)?)\s+(?:[a-z-]+\s+){0,4}(?:leads?|prospects?)\s+(?:per|a|each|every)\s+day/i) ?? t.match(/(\d+(?:\.\d+)?)\s+(?:[a-z-]+\s+){0,4}(?:leads?|prospects?)\s+daily/i);
  if (perDay) return { metric: /qualified/i.test(text) ? "qualified_leads_per_day" : "leads_per_day", value: num(perDay[1])! };
  const leads = t.match(/(\d+(?:\.\d+)?\s*(?:k)?)\s+(?:[a-z-]+\s+){0,4}(?:leads?|prospects?)\b/i);
  if (leads) return { metric: /qualified/i.test(text) ? "qualified_leads" : "leads", value: num(leads[1])! };
  if (playbook === "REVENUE") {
    const money = t.match(/[$€£₹]\s?(\d+(?:\.\d+)?\s*(?:k|m|mn|million|thousand|lakh|crore)?)/i) ?? t.match(/(\d+(?:\.\d+)?\s*(?:k|m|mn|million|thousand|lakh|crore)?)\s*(?:usd|dollars|eur|gbp|inr|aed)\b/i);
    if (money) {
      const cur = /€|eur/i.test(t) ? "EUR" : /£|gbp/i.test(t) ? "GBP" : /₹|inr|lakh|crore/i.test(t) ? "INR" : /aed/i.test(t) ? "AED" : "USD";
      return { metric: `revenue_${cur.toLowerCase()}${/\bthis month|per month|monthly|a month\b/i.test(t) ? "_month" : ""}`, value: num(money[1])! };
    }
  }
  return null;
}

/** Codes people actually write in objectives (others such as IT/ID/IN collide with ordinary words). */
const REGION_CODES: Record<string, string> = { US: "na", USA: "na", UK: "eu", GB: "eu", EU: "eu", UAE: "mena", KSA: "mena", GCC: "mena", MENA: "mena", APAC: "asia" };
const REGION_WORDS: [RegExp, string][] = [[/\bnorth america\b/, "na"], [/\beurope\b/, "eu"], [/\bmiddle east\b|\bgulf\b/, "mena"], [/\basia\b|\bsoutheast asia\b/, "asia"]];

/** Region named in the objective: a country name, a region name, or a common code written in capitals (US, UK, UAE…). */
export function detectRegion(text: string): string | null {
  const undotted = text.replace(/\b([A-Z])\.([A-Z])\.(?:([A-Z])\.)?/g, (_m, a: string, b: string, c?: string) => `${a}${b}${c ?? ""}`);
  for (const [code, r] of Object.entries(REGION_CODES)) if (new RegExp(`(^|[^A-Za-z])${code}([^A-Za-z]|$)`).test(undotted)) return r;
  const lower = ` ${text.toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ")} `;
  for (const r of REGIONS) for (const c of r.countries) if (c.length > 3 && lower.includes(` ${c} `)) return r.key;
  for (const [re, r] of REGION_WORDS) if (re.test(lower)) return r;
  return null;
}

export interface Stage {
  key: string;
  owner: string;
  title: string;
  instructions: string;
  /** Stage keys that must finish first. */
  after?: string[];
  /** A system step (no AI employee): e.g. creating the lead campaign record. */
  system?: "CREATE_CAMPAIGN" | "MARKET_RESEARCH";
}

const REGIONAL: Record<string, string> = { na: "region-na", eu: "region-eu", mena: "region-mena", asia: "region-asia", india: "region-india" };

/** Deterministic plan for a playbook. Owners are AI employees; every stage becomes a real task. */
export function planFor(playbook: Playbook, statement: string, region: string | null): Stage[] {
  const regional = region ? REGIONAL[region] : null;
  const s = (key: string, owner: string, title: string, instructions: string, after?: string[], system?: Stage["system"]): Stage => ({ key, owner, title, instructions, after, system });
  switch (playbook) {
    case "LEAD_GENERATION":
      return [
        s("research", "intel-director", "Research the target market and define the ICP", `Objective: ${statement}\nDefine the ideal customer profile (industries, company size, countries, buyer roles/titles) and buying triggers. Record findings with sources.`, undefined, "MARKET_RESEARCH"),
        s("offer", "cmo", "Define the offer and positioning for the target ICP", `Objective: ${statement}\nUse the market research results. Define the offer, positioning and the message for outreach. Delegate supporting content to your team if useful.`, ["research"]),
        s("campaign", "leadgen-director", "Set up and run the lead generation campaign", `Objective: ${statement}\nA lead campaign record has been created (see the campaign link in your inbox). Update its ICP (titles, countries, domains) from the research and run the lead pipeline with runLeadPipeline. If a provider is NOT CONNECTED, call reportBlocker with exactly which one.`, ["research"], "CREATE_CAMPAIGN"),
        s("outreach", "sdr", "Prepare personalised outreach for qualified prospects", `Objective: ${statement}\nFor qualified prospects of the lead campaign, prepare personalised outreach drafts. Sending requires human approval and follows opt-outs and daily limits.`, ["campaign", "offer"]),
        s("content", "content-manager", "Create supporting content for the campaign", `Objective: ${statement}\nDraft supporting content (article outline, social posts brief) matching the offer. Drafts go to review.`, ["offer"]),
        s("measure", "revenue-analyst", "Measure the funnel and report bottlenecks", `Objective: ${statement}\nReport the lead generation funnel with real numbers and the main bottleneck. Missing data is reported as unavailable.`, ["campaign"]),
      ];
    case "MARKET_ENTRY":
      return [
        s("research", "intel-director", "Market research for the new market", `Objective: ${statement}\nMarket opportunity, ICP, competitors, pricing observations, channels — with sources.`, undefined, "MARKET_RESEARCH"),
        s("strategy", "strategy-director", "Market entry options and recommendation", `Objective: ${statement}\nCompare entry options using the research and internal data.`, ["research"]),
        ...(regional ? [s("regional", regional, "Regional entry plan", `Objective: ${statement}\nRegional view: existing leads, pipeline and customers in the region; local considerations.`, ["research"])] : []),
        s("gtm", "cmo", "Go-to-market plan", `Objective: ${statement}\nPositioning, offer and channels for the new market.`, ["strategy"]),
        s("revenue", "cro", "Revenue and pipeline plan for the market", `Objective: ${statement}\nPipeline targets and sales approach; delegate lead generation set-up to the Lead Generation Director if appropriate.`, ["strategy"]),
        s("compliance", "clo", "Compliance and risk checklist for the market", `Objective: ${statement}\nChecklist of legal, data-protection and contractual considerations to review with counsel (not legal advice).`, ["research"]),
      ];
    case "REVENUE":
      return [
        s("plan", "cro", "Revenue plan", `Objective: ${statement}\nPipeline coverage versus the target from real deals; priorities; delegate to Sales and Lead Generation.`),
        s("deals", "sales-director", "Deal review: next actions and stalled deals", `Objective: ${statement}\nReview open deals, set follow-ups and flag stalled high-value deals.`, ["plan"]),
        s("collections", "cfo", "Receivables and collections review", `Objective: ${statement}\nOverdue invoices and collection priorities (reminders need approval).`),
        s("demand", "cmo", "Demand plan supporting the revenue target", `Objective: ${statement}\nChannels and campaigns most likely to add pipeline, based on real source performance.`, ["plan"]),
        s("expansion", "account-manager", "Expansion opportunities in existing accounts", `Objective: ${statement}\nExisting clients with expansion or renewal potential.`),
      ];
    case "PIPELINE":
      return [
        s("plan", "cro", "Pipeline growth plan", `Objective: ${statement}\nCurrent pipeline, gaps and the plan.`),
        s("deals", "sales-director", "Advance existing deals", `Objective: ${statement}\nNext actions for open deals.`, ["plan"]),
        s("leadgen", "leadgen-director", "Lead generation for new pipeline", `Objective: ${statement}\nRun or set up lead campaigns; report provider status honestly.`, ["plan"]),
        s("campaigns", "campaign-manager", "Campaigns to create pipeline", `Objective: ${statement}\nCampaign plan based on real performance data.`, ["plan"]),
      ];
    case "DELIVERY":
      return [
        s("review", "coo", "Delivery review: where projects are delayed and why", `Objective: ${statement}\nDelayed projects, overdue tasks and root causes from project records.`),
        s("projects", "project", "Project-by-project recovery actions", `Objective: ${statement}\nRecovery actions and task plans for delayed projects.`, ["review"]),
        s("engineering", "engineering-manager", "Engineering workload and blockers", `Objective: ${statement}\nWorkload and blockers on engineering tasks.`, ["review"]),
        s("clients", "cco", "Client communication for delayed projects", `Objective: ${statement}\nWhich clients need an update; drafts need approval.`, ["review"]),
      ];
    case "PRODUCT_LAUNCH":
      return [
        s("plan", "cpo", "Launch plan", `Objective: ${statement}\nScope, readiness and launch milestones.`),
        s("requirements", "product-manager", "Requirements and UX readiness", `Objective: ${statement}\nRequirements and UX checklist.`, ["plan"]),
        s("qa", "qa-engineer", "Launch test plan", `Objective: ${statement}\nTest plan and open quality risks.`, ["plan"]),
        s("marketing", "cmo", "Launch marketing plan", `Objective: ${statement}\nPositioning, channels and launch content.`, ["plan"]),
        s("social", "social-manager", "Launch social posts (drafts for approval)", `Objective: ${statement}\nPlatform-specific launch posts, saved for approval.`, ["marketing"]),
        s("sales", "sales-director", "Sales enablement for the launch", `Objective: ${statement}\nWho to contact first and talking points.`, ["plan"]),
      ];
    default:
      return [];
  }
}
