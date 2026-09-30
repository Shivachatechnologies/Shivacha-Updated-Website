import type { AgentSpec } from "@/lib/ai/catalog";

/**
 * The AI company organisation (pure — no database access).
 *
 * The 12 existing AI employees (lib/ai/catalog.ts, unchanged) are placed into the hierarchy; the 48 employees below
 * are added around them. Every employee is an ordinary AgentSpec: it runs on the existing runtime (lib/ai/runner.ts),
 * inherits the permissions of the person who directed it, and may only use the tools listed here (least privilege).
 * Tools that do not exist in the platform are never granted — capabilities describe only what the tools can do, and
 * `limits` states plainly what an employee cannot do.
 */

export const LEVELS = ["CHIEF_OF_STAFF", "EXECUTIVE", "DIRECTOR", "MANAGER", "SPECIALIST"] as const;
export type Level = (typeof LEVELS)[number];
export const LEVEL_LABELS: Record<Level, string> = { CHIEF_OF_STAFF: "Chief of Staff", EXECUTIVE: "Executive", DIRECTOR: "Director", MANAGER: "Manager", SPECIALIST: "Specialist" };
export const LEVEL_RANK: Record<Level, number> = { CHIEF_OF_STAFF: 0, EXECUTIVE: 1, DIRECTOR: 2, MANAGER: 3, SPECIALIST: 4 };

export interface DepartmentSpec {
  key: string;
  name: string;
  head: string;
  description: string;
  sort: number;
}

export const DEPARTMENTS: DepartmentSpec[] = [
  { key: "executive", name: "Executive Office", head: "ceo", description: "Chief of Staff and strategy: turns CEO objectives into company plans.", sort: 0 },
  { key: "intelligence", name: "Market Intelligence", head: "intel-director", description: "Market, competitor and data research with sources.", sort: 1 },
  { key: "marketing", name: "Marketing & Growth", head: "cmo", description: "Content, SEO, social, campaigns and marketing analytics.", sort: 2 },
  { key: "leadgen", name: "Lead Generation", head: "leadgen-director", description: "Discover, verify, deduplicate and qualify prospects from connected providers.", sort: 3 },
  { key: "sales", name: "Sales", head: "cro", description: "Pipeline, outreach preparation, proposals and sales operations.", sort: 4 },
  { key: "customer", name: "Customer", head: "cco", description: "Customer success, support and account management.", sort: 5 },
  { key: "technology", name: "Technology", head: "cto", description: "Engineering planning, QA, DevOps and security tracking.", sort: 6 },
  { key: "product", name: "Product", head: "cpo", description: "Product strategy, product management and product analytics.", sort: 7 },
  { key: "operations", name: "Operations", head: "coo", description: "Project delivery, operations, procurement and knowledge.", sort: 8 },
  { key: "finance", name: "Finance", head: "cfo", description: "Billing, collections, revenue and financial analytics (read-only on money).", sort: 9 },
  { key: "people", name: "People", head: "chro", description: "HR, recruiting and people operations.", sort: 10 },
  { key: "legal", name: "Legal & Risk", head: "clo", description: "Legal operations, compliance and risk.", sort: 11 },
  { key: "regional", name: "Regional Leadership", head: "ceo", description: "Regional leaders for North America, UK/Europe, MENA, Asia and India.", sort: 12 },
];

export interface RegionSpec {
  key: string;
  name: string;
  leader: string;
  /** Country names and ISO-3166 alpha-2 codes, lower case (Lead.country is free text). */
  countries: string[];
}

export const REGIONS: RegionSpec[] = [
  { key: "na", name: "North America", leader: "region-na", countries: ["united states", "usa", "us", "united states of america", "canada", "ca", "mexico", "mx"] },
  {
    key: "eu",
    name: "UK / Europe",
    leader: "region-eu",
    countries: ["united kingdom", "uk", "gb", "great britain", "england", "scotland", "wales", "ireland", "ie", "germany", "de", "france", "fr", "netherlands", "nl", "spain", "es", "italy", "it", "switzerland", "ch", "sweden", "se", "norway", "no", "denmark", "dk", "finland", "fi", "belgium", "be", "austria", "at", "poland", "pl", "portugal", "pt", "luxembourg", "lu", "estonia", "ee", "lithuania", "lt", "czech republic", "czechia", "cz", "greece", "gr", "romania", "ro"],
  },
  {
    key: "mena",
    name: "Middle East / MENA",
    leader: "region-mena",
    countries: ["united arab emirates", "uae", "ae", "saudi arabia", "ksa", "sa", "qatar", "qa", "bahrain", "bh", "kuwait", "kw", "oman", "om", "egypt", "eg", "jordan", "jo", "israel", "il", "turkey", "türkiye", "tr", "morocco", "ma", "lebanon", "lb", "tunisia", "tn"],
  },
  {
    key: "asia",
    name: "Asia",
    leader: "region-asia",
    countries: ["singapore", "sg", "hong kong", "hk", "japan", "jp", "south korea", "korea", "kr", "china", "cn", "indonesia", "id", "malaysia", "my", "thailand", "th", "vietnam", "vn", "philippines", "ph", "australia", "au", "new zealand", "nz", "taiwan", "tw", "bangladesh", "bd", "sri lanka", "lk", "pakistan", "pk", "nepal", "np"],
  },
  { key: "india", name: "India", leader: "region-india", countries: ["india", "in", "bharat"] },
];

/** Region for a free-text country (null when it is blank or not in any region). */
export function regionOf(country: string | null | undefined): string | null {
  const c = (country ?? "").trim().toLowerCase();
  if (!c) return null;
  return REGIONS.find((r) => r.countries.includes(c))?.key ?? null;
}

export interface Placement {
  level: Level;
  department: string;
  /** AI manager slug; null = reports to the human CEO. */
  manager: string | null;
  region?: string;
  skills: string[];
}

/** Where the existing 12 AI employees sit. `legacyManager` is their pre-organisation default (see syncOrganisation). */
export const CORE_PLACEMENT: Record<string, Placement & { legacyManager: string | null }> = {
  ceo: { level: "CHIEF_OF_STAFF", department: "executive", manager: null, legacyManager: null, skills: ["Planning", "Delegation", "Executive reporting"] },
  research: { level: "SPECIALIST", department: "intelligence", manager: "intel-director", legacyManager: "ceo", skills: ["Company research", "Competitor research", "Sourcing"] },
  marketing: { level: "SPECIALIST", department: "marketing", manager: "cmo", legacyManager: "ceo", skills: ["Marketing analytics", "Attribution"] },
  sales: { level: "SPECIALIST", department: "sales", manager: "sales-director", legacyManager: "ceo", skills: ["Qualification", "Deal strategy", "Follow-ups"] },
  sdr: { level: "SPECIALIST", department: "sales", manager: "sales-director", legacyManager: "sales", skills: ["Prospecting", "Outreach drafting"] },
  proposal: { level: "SPECIALIST", department: "sales", manager: "sales-director", legacyManager: "sales", skills: ["Proposal writing", "Scoping"] },
  crm: { level: "SPECIALIST", department: "sales", manager: "sales-ops-manager", legacyManager: "sales", skills: ["CRM hygiene", "Deduplication"] },
  "customer-success": { level: "MANAGER", department: "customer", manager: "cco", legacyManager: "ceo", skills: ["Account health", "Expansion"] },
  support: { level: "SPECIALIST", department: "customer", manager: "customer-success", legacyManager: "customer-success", skills: ["Ticket triage", "Reply drafting"] },
  project: { level: "MANAGER", department: "operations", manager: "coo", legacyManager: "ceo", skills: ["Project planning", "Risk tracking"] },
  finance: { level: "SPECIALIST", department: "finance", manager: "cfo", legacyManager: "ceo", skills: ["Receivables", "Revenue reporting"] },
  knowledge: { level: "SPECIALIST", department: "operations", manager: "coo", legacyManager: "ceo", skills: ["Knowledge management"] },
};

export interface OrgEmployee extends AgentSpec, Placement {
  jobTitle: string;
}

/** Tools shared by every manager-level employee to read the company's own organisation and objectives. */
const MGMT = ["getOrgChart", "getObjectiveStatus"];

const e = (o: OrgEmployee) => o;

export const ORG_EMPLOYEES: OrgEmployee[] = [
  // ─── Executive office ───
  e({ slug: "strategy-director", name: "AI Strategy Director", jobTitle: "AI Director of Strategy", level: "DIRECTOR", department: "executive", manager: "ceo", requires: "executive:view", skills: ["Strategy", "Prioritisation"], tools: ["getBusinessSummary", "getInsights", "getPipelineSummary", "getMarketingSummary", "searchKnowledge", "getRegionalPerformance", "getWorkforcePerformance", ...MGMT], description: "Turns company data into strategic options and priorities for the Chief of Staff. Works only from live records and cited research.", capabilities: ["Strategic options from live KPIs", "Priority recommendations", "Regional comparison"], limits: ["Recommends only; changes nothing"] }),

  // ─── Executives ───
  e({ slug: "cmo", name: "AI Chief Marketing Officer", jobTitle: "AI Chief Marketing Officer", level: "EXECUTIVE", department: "marketing", manager: "ceo", requires: "marketing:view", skills: ["Marketing strategy", "Positioning"], tools: ["getMarketingSummary", "searchCampaigns", "getGrowthSummary", "getLeadGenFunnel", "getVisitorSummary", "searchKnowledge", "getRegionalPerformance", "getAdCampaigns", ...MGMT], description: "Owns marketing and growth plans: markets, offers, channels and campaign priorities, based on real campaign and lead-source data.", capabilities: ["Marketing plan", "Offer and positioning", "Channel priorities", "Delegates to marketing and growth teams"], limits: ["Cannot publish or spend money; publishing needs human approval"] }),
  e({ slug: "cro", name: "AI Chief Revenue Officer", jobTitle: "AI Chief Revenue Officer", level: "EXECUTIVE", department: "sales", manager: "ceo", requires: "leads:view", skills: ["Revenue planning", "Pipeline management"], tools: ["getDealRisks", "getSalesForecast", "getPipelineSummary", "searchDeals", "getDeal", "countLeads", "countProposals", "getLeadGenFunnel", "getRegionalPerformance", "searchProposals", ...MGMT], description: "Owns the revenue plan: pipeline coverage, lead generation targets, sales priorities and stalled high-value deals.", capabilities: ["Revenue plan", "Pipeline coverage", "Escalates high-value stalled deals", "Delegates to sales and lead generation"], limits: ["Cannot change deal values or send email without approval"] }),
  e({ slug: "cto", name: "AI Chief Technology Officer", jobTitle: "AI Chief Technology Officer", level: "EXECUTIVE", department: "technology", manager: "ceo", requires: "projects:view", skills: ["Technical planning", "Delivery risk"], tools: ["searchProjects", "getProject", "countProjects", "countTasks", "searchTickets", "searchKnowledge", ...MGMT], description: "Plans technical work across projects: delivery risk, engineering workload and quality issues from project and ticket records.", capabilities: ["Technical delivery plan", "Engineering risk", "Delegates to engineering"], limits: ["AI employees cannot write, commit or deploy code; engineering execution is done by people"] }),
  e({ slug: "coo", name: "AI Chief Operating Officer", jobTitle: "AI Chief Operating Officer", level: "EXECUTIVE", department: "operations", manager: "ceo", requires: "projects:view", skills: ["Operations", "Delivery"], tools: ["getProjectHealth", "getClientHealth", "searchProjects", "getProject", "countProjects", "countTasks", "getInsights", "searchKnowledge", "createTask", ...MGMT], description: "Runs delivery and operations: project health, blockers, cross-department coordination and operational risks.", capabilities: ["Delivery oversight", "Blocker escalation", "Cross-department coordination"], limits: ["Project changes follow the approval policy"] }),
  e({ slug: "cfo", name: "AI Chief Financial Officer", jobTitle: "AI Chief Financial Officer", level: "EXECUTIVE", department: "finance", manager: "ceo", requires: "finance:view", skills: ["Financial planning", "Cash"], tools: ["getCollectionsQueue", "listPurchaseRequests", "getFinanceSummary", "searchInvoices", "getInvoice", "getPipelineSummary", ...MGMT], description: "Monitors revenue, receivables, overdue invoices and AI spend. Read-only on financial records.", capabilities: ["Cash and receivables summary", "Collections priorities", "Budget monitoring"], limits: ["Cannot create payments, refunds or change invoices"] }),
  e({ slug: "cpo", name: "AI Chief Product Officer", jobTitle: "AI Chief Product Officer", level: "EXECUTIVE", department: "product", manager: "ceo", requires: "projects:view", skills: ["Product strategy"], tools: ["searchProjects", "getProject", "searchTickets", "countTickets", "getVisitorSummary", "searchKnowledge", ...MGMT], description: "Product strategy from customer tickets, project history and website behaviour.", capabilities: ["Product priorities", "Launch planning", "Delegates to product team"], limits: ["Recommends only"] }),
  e({ slug: "chro", name: "AI Chief People Officer", jobTitle: "AI Chief People Officer", level: "EXECUTIVE", department: "people", manager: "ceo", requires: "employees:view", skills: ["People strategy"], tools: ["listOpenRoles", "getWorkforceToday", "getLeaveOverview", "searchKnowledge", ...MGMT], description: "Coordinates HR, recruiting and people operations from the human workforce records.", capabilities: ["Hiring plans", "People operations coordination"], limits: ["Cannot change pay, contracts or employee records"] }),
  e({ slug: "clo", name: "AI Head of Legal & Risk", jobTitle: "AI Head of Legal & Risk", level: "EXECUTIVE", department: "legal", manager: "ceo", requires: "contracts:view", skills: ["Legal operations", "Risk"], tools: ["getComplianceRegister", "getRiskRegister", "searchProposals", "searchKnowledge", "getInsights", ...MGMT], description: "Coordinates legal operations, compliance checklists and risk escalation.", capabilities: ["Compliance checklists", "Risk escalation"], limits: ["Not legal advice; never signs or commits the company to anything"] }),
  e({ slug: "cco", name: "AI Chief Customer Officer", jobTitle: "AI Chief Customer Officer", level: "EXECUTIVE", department: "customer", manager: "ceo", requires: "clients:view", skills: ["Customer experience", "Retention"], tools: ["getClientHealth", "searchClients", "getClient", "searchTickets", "countTickets", "countClients", "searchProjects", ...MGMT], description: "Owns customer health: support load, SLA risk, account risks and retention.", capabilities: ["Customer health", "Retention priorities", "Delegates to success and support"], limits: ["Customer email needs approval"] }),

  // ─── Market intelligence ───
  e({ slug: "intel-director", name: "AI Market Intelligence Director", jobTitle: "AI Director of Market Intelligence", level: "DIRECTOR", department: "intelligence", manager: "strategy-director", requires: "leads:view", skills: ["Market research", "ICP definition"], tools: ["webResearch", "searchKnowledge", "getVisitorSummary", "countLeads", "getRegionalPerformance", "getGrowthSummary", "recordMarketFinding", "completeMarketResearch", ...MGMT], description: "Runs market research: opportunity, ICP, personas, competitors and positioning. Every statistic carries its source; inference is labelled.", capabilities: ["Market opportunity", "ICP and personas", "Competitor observations", "Saves research to the Knowledge Base"], limits: ["Public web research only when a web-search provider is connected"] }),
  e({ slug: "data-analyst", name: "AI Data Intelligence Analyst", jobTitle: "AI Data Intelligence Analyst", level: "SPECIALIST", department: "intelligence", manager: "intel-director", requires: "leads:view", skills: ["Data analysis"], tools: ["countLeads", "countClients", "countProposals", "getPipelineSummary", "getVisitorSummary", "getRegionalPerformance", "getLeadGenFunnel"], description: "Analyses the company's own data: lead sources, regions, conversion and website behaviour.", capabilities: ["Internal data analysis", "Regional and source breakdowns"], limits: ["Reads data only"] }),

  // ─── Marketing & growth ───
  e({ slug: "growth-director", name: "AI Growth Director", jobTitle: "AI Growth Director", level: "DIRECTOR", department: "marketing", manager: "cmo", requires: "growth:view", skills: ["Growth loops", "Experiments"], tools: ["getGrowthSummary", "getLeadGenFunnel", "searchCampaigns", "getMarketingSummary", "listSocialPosts", "listProspects", "getVisitorSummary", "getAdCampaigns", "pauseAdCampaign", "getSocialPerformance", ...MGMT], description: "Runs the growth programme across social, content, email and lead generation using the Growth department's controls.", capabilities: ["Growth plan", "Channel performance", "Delegates to content, social and campaigns"], limits: ["Respects growth kill switches and budgets"] }),
  e({ slug: "content-manager", name: "AI Content Manager", jobTitle: "AI Content Manager", level: "MANAGER", department: "marketing", manager: "growth-director", requires: "growth:view", skills: ["Content strategy", "Copywriting"], tools: ["getContentInventory", "draftContentAsset", "searchKnowledge", "listSocialPosts"], description: "Plans and drafts content (articles, case-study outlines, scripts) as review items in the Content Studio.", capabilities: ["Content drafts for review", "Repurposing plans"], limits: ["Drafts only; a person approves and publishes"] }),
  e({ slug: "seo-specialist", name: "AI SEO Specialist", jobTitle: "AI SEO Specialist", level: "SPECIALIST", department: "marketing", manager: "growth-director", requires: "marketing:view", skills: ["SEO"], tools: ["getContentInventory", "getVisitorSummary", "getMarketingSummary", "draftContentAsset"], description: "Finds SEO and content opportunities from the site's own content inventory and traffic.", capabilities: ["SEO opportunities", "Content briefs"], limits: ["No Search Console data unless connected; cannot change the website"] }),
  e({ slug: "social-manager", name: "AI Social Media Manager", jobTitle: "AI Social Media Manager", level: "MANAGER", department: "marketing", manager: "growth-director", requires: "growth:view", skills: ["Social strategy", "Platform copy"], tools: ["listSocialPosts", "draftSocialPost", "getGrowthSummary", "getSocialPerformance"], description: "Drafts platform-specific posts (LinkedIn, Instagram, Facebook, X, YouTube) into the social approval queue.", capabilities: ["Post drafts per platform", "Content calendar suggestions"], limits: ["Every post is approved by a person; published only with platform confirmation"] }),
  e({ slug: "campaign-manager", name: "AI Campaign Manager", jobTitle: "AI Campaign Manager", level: "MANAGER", department: "marketing", manager: "growth-director", requires: "marketing:view", skills: ["Campaign planning"], tools: ["searchCampaigns", "getMarketingSummary", "getLeadGenFunnel", "draftEmail", "getAdCampaigns", "proposeAdCampaign", "requestAdLaunch", "pauseAdCampaign", "changeAdBudget"], description: "Plans campaigns (objective, audience, offer, channels), prepares paid-media campaigns and reviews real performance.", capabilities: ["Campaign plans", "Paid-media proposals (created paused)", "Launch requests and budget changes (approval)", "Pauses underperforming ads", "Email drafts"], limits: ["Cannot spend without approval or the CEO's autonomous ads policy; cannot send email without approval"] }),

  // ─── Lead generation ───
  e({ slug: "leadgen-director", name: "AI Lead Generation Director", jobTitle: "AI Director of Lead Generation", level: "DIRECTOR", department: "leadgen", manager: "cro", requires: "growth:view", skills: ["Pipeline generation", "Data providers"], tools: ["getLeadGenFunnel", "listProspects", "getGrowthSummary", "runLeadPipeline", "enrollProspectsInSequence", "countLeads", ...MGMT], description: "Runs lead generation campaigns through connected B2B data providers: discover, verify, deduplicate, score and qualify.", capabilities: ["Runs the lead pipeline", "Source performance", "Delegates to prospecting and qualification"], limits: ["Only legitimate connected providers (Apollo, Hunter); stops at NOT CONNECTED"] }),
  e({ slug: "prospect-researcher", name: "AI Prospect Researcher", jobTitle: "AI Prospect Research Specialist", level: "SPECIALIST", department: "leadgen", manager: "leadgen-director", requires: "growth:view", skills: ["Account research"], tools: ["listProspects", "webResearch", "searchKnowledge", "runLeadPipeline"], description: "Researches target accounts and runs discovery for lead campaigns.", capabilities: ["Account research", "Prospect discovery via providers"], limits: ["No scraping; provider terms and rate limits apply"] }),
  e({ slug: "verification-specialist", name: "AI Enrichment & Verification Specialist", jobTitle: "AI Enrichment & Verification Specialist", level: "SPECIALIST", department: "leadgen", manager: "leadgen-director", requires: "growth:view", skills: ["Email verification", "Enrichment"], tools: ["listProspects", "getLeadGenFunnel", "runLeadPipeline"], description: "Keeps prospect data accurate: verification status, duplicates and suppression.", capabilities: ["Verification via connected provider", "Duplicate reporting"], limits: ["Verification requires a connected provider"] }),
  e({ slug: "qualification-specialist", name: "AI Qualification Specialist", jobTitle: "AI Lead Qualification Specialist", level: "SPECIALIST", department: "leadgen", manager: "leadgen-director", requires: "leads:view", skills: ["Lead scoring"], tools: ["searchLeads", "getLead", "qualifyLead", "countLeads", "listHighIntentVisitors"], description: "Scores CRM leads with the transparent qualification rules and flags sales-ready ones.", capabilities: ["Rule-based qualification", "Sales-ready flags"], limits: ["Scores follow the configured ICP; no guessing of personal data"] }),

  // ─── Sales ───
  e({ slug: "sales-director", name: "AI Sales Director", jobTitle: "AI Sales Director", level: "DIRECTOR", department: "sales", manager: "cro", requires: "deals:view", skills: ["Sales management", "Forecasting"], tools: ["getSalesPriorities", "getNextBestActions", "getDealRisks", "getSalesForecast", "getPipelineSummary", "searchDeals", "getDeal", "searchProposals", "countProposals", "createFollowUp", "updateDealStage", ...MGMT], description: "Manages the sales team: deal reviews, next actions, follow-ups and proposal priorities.", capabilities: ["Deal reviews", "Follow-up planning", "Delegates to AE, SDR and proposals"], limits: ["Deal changes follow the approval policy"] }),
  e({ slug: "sales-ops-manager", name: "AI Sales Operations Manager", jobTitle: "AI Sales Operations Manager", level: "MANAGER", department: "sales", manager: "cro", requires: "leads:view", skills: ["Sales operations"], tools: ["getNextBestActions", "findDuplicates", "findDataGaps", "getOverdueFollowUps", "countLeads", "getPipelineSummary", ...MGMT], description: "Keeps sales data and process healthy: duplicates, data gaps, overdue follow-ups.", capabilities: ["Process health", "Data quality", "Delegates to CRM operations"], limits: ["Merges and deletions are done by people"] }),
  e({ slug: "revenue-analyst", name: "AI Revenue Analyst", jobTitle: "AI Revenue Analyst", level: "SPECIALIST", department: "sales", manager: "cro", requires: "deals:view", skills: ["Revenue analytics"], tools: ["getSalesForecast", "getDealRisks", "getPipelineSummary", "searchDeals", "countProposals", "getRegionalPerformance"], description: "Analyses pipeline, win rates and revenue by region and source.", capabilities: ["Pipeline analytics", "Win-rate analysis"], limits: ["Reads data only"] }),

  // ─── Customer ───
  e({ slug: "account-manager", name: "AI Account Manager", jobTitle: "AI Account & Retention Manager", level: "MANAGER", department: "customer", manager: "cco", requires: "clients:view", skills: ["Account management", "Retention"], tools: ["getClientHealth", "searchClients", "getClient", "searchProposals", "countClients", "searchTickets", "draftEmail"], description: "Account plans, renewal and retention risks, and expansion opportunities.", capabilities: ["Account plans", "Retention risks", "Client email drafts"], limits: ["Client email needs approval"] }),

  // ─── Technology ───
  e({ slug: "engineering-manager", name: "AI Engineering Manager", jobTitle: "AI Engineering Manager", level: "MANAGER", department: "technology", manager: "cto", requires: "projects:view", skills: ["Engineering planning"], tools: ["getProjectHealth", "searchProjects", "getProject", "countTasks", "createTask", "updateTaskStatus", "draftProjectUpdate", ...MGMT], description: "Breaks technical work into project tasks, tracks progress and reports blockers.", capabilities: ["Engineering task plans", "Progress tracking"], limits: ["Cannot write or deploy code"] }),
  e({ slug: "frontend-engineer", name: "AI Frontend Engineer", jobTitle: "AI Frontend Engineer", level: "SPECIALIST", department: "technology", manager: "engineering-manager", requires: "projects:view", skills: ["Frontend planning", "UI estimates"], tools: ["searchProjects", "getProject", "searchKnowledge", "draftProjectUpdate"], description: "Plans and estimates frontend work and drafts technical notes for project tasks.", capabilities: ["Frontend plans and estimates", "Technical notes"], limits: ["Cannot write, commit or deploy code"] }),
  e({ slug: "backend-engineer", name: "AI Backend Engineer", jobTitle: "AI Backend Engineer", level: "SPECIALIST", department: "technology", manager: "engineering-manager", requires: "projects:view", skills: ["Backend planning", "Architecture notes"], tools: ["searchProjects", "getProject", "searchKnowledge", "draftProjectUpdate"], description: "Plans and estimates backend and integration work.", capabilities: ["Backend plans and estimates", "Architecture notes"], limits: ["Cannot write, commit or deploy code"] }),
  e({ slug: "qa-engineer", name: "AI QA Engineer", jobTitle: "AI QA Engineer", level: "SPECIALIST", department: "technology", manager: "engineering-manager", requires: "projects:view", skills: ["Test planning"], tools: ["searchProjects", "getProject", "searchTickets", "countTasks"], description: "Test plans and quality risks from project tasks and support tickets.", capabilities: ["Test plans", "Defect trends from tickets"], limits: ["Cannot run tests against client systems"] }),
  e({ slug: "devops-engineer", name: "AI DevOps Engineer", jobTitle: "AI DevOps Engineer", level: "SPECIALIST", department: "technology", manager: "engineering-manager", requires: "projects:view", skills: ["Release planning"], tools: ["searchProjects", "getProject", "searchKnowledge"], description: "Release and environment checklists for projects.", capabilities: ["Release checklists"], limits: ["No infrastructure access"] }),
  e({ slug: "security-engineer", name: "AI Security Engineer", jobTitle: "AI Security Engineer", level: "SPECIALIST", department: "technology", manager: "cto", requires: "projects:view", skills: ["Security review"], tools: ["searchKnowledge", "searchTickets", "searchProjects"], description: "Security checklists and security-related ticket review.", capabilities: ["Security checklists", "Ticket review"], limits: ["No access to secrets or infrastructure"] }),

  // ─── Product ───
  e({ slug: "product-manager", name: "AI Product Manager", jobTitle: "AI Product Manager (incl. UX)", level: "MANAGER", department: "product", manager: "cpo", requires: "projects:view", skills: ["Product management", "UX"], tools: ["searchProjects", "getProject", "searchTickets", "searchKnowledge", "getVisitorSummary"], description: "Requirements, UX notes and roadmap input from tickets, projects and website behaviour.", capabilities: ["Requirements drafts", "UX observations"], limits: ["Recommends only"] }),
  e({ slug: "product-analyst", name: "AI Product Analyst", jobTitle: "AI Product Analyst", level: "SPECIALIST", department: "product", manager: "cpo", requires: "visitors:view", skills: ["Product analytics"], tools: ["getVisitorSummary", "countLiveVisitors", "getMarketingSummary", "countTickets"], description: "Product and website usage analytics from visitor intelligence.", capabilities: ["Usage analytics"], limits: ["Reads data only"] }),

  // ─── Operations ───
  e({ slug: "operations-manager", name: "AI Operations Manager", jobTitle: "AI Operations Manager", level: "MANAGER", department: "operations", manager: "coo", requires: "projects:view", skills: ["Operations"], tools: ["countTasks", "countProjects", "getInsights", "searchKnowledge", "createNotification"], description: "Day-to-day operational health, overdue work and internal notifications.", capabilities: ["Operational health", "Team notifications"], limits: ["Notifications follow the approval policy"] }),
  e({ slug: "procurement-specialist", name: "AI Procurement & Vendor Specialist", jobTitle: "AI Procurement & Vendor Specialist", level: "SPECIALIST", department: "operations", manager: "coo", requires: "projects:view", skills: ["Procurement", "Vendor management"], tools: ["listPurchaseRequests", "proposePurchaseRequest", "searchKnowledge", "draftEmail"], description: "Vendor comparisons and procurement request drafts.", capabilities: ["Vendor comparison notes", "Request drafts"], limits: ["No purchasing module: cannot buy or commit spend"] }),

  // ─── Finance ───
  e({ slug: "billing-specialist", name: "AI Billing Specialist", jobTitle: "AI Billing Specialist", level: "SPECIALIST", department: "finance", manager: "cfo", requires: "finance:view", skills: ["Billing"], tools: ["searchInvoices", "getInvoice", "searchClients"], description: "Invoice status monitoring and billing issue detection.", capabilities: ["Invoice monitoring"], limits: ["Cannot create or change invoices"] }),
  e({ slug: "collections-specialist", name: "AI Collections Specialist", jobTitle: "AI Collections Specialist", level: "SPECIALIST", department: "finance", manager: "cfo", requires: "finance:view", skills: ["Collections"], tools: ["getCollectionsQueue", "searchInvoices", "getInvoice", "draftEmail", "sendEmail"], description: "Overdue invoice follow-up: prioritises and drafts payment reminders.", capabilities: ["Collections priorities", "Reminder drafts (sending always needs approval)"], limits: ["Every reminder email needs human approval"] }),
  e({ slug: "financial-analyst", name: "AI Financial Analyst", jobTitle: "AI Financial Analyst", level: "SPECIALIST", department: "finance", manager: "cfo", requires: "finance:view", skills: ["Financial analysis"], tools: ["getFinanceSummary", "searchInvoices", "getPipelineSummary"], description: "Revenue, receivables and pipeline-to-cash analysis per currency.", capabilities: ["Financial reports"], limits: ["Never converts or adds different currencies"] }),

  // ─── People ───
  e({ slug: "hr-manager", name: "AI HR Manager", jobTitle: "AI HR Manager", level: "MANAGER", department: "people", manager: "chro", requires: "employees:view", skills: ["HR operations"], tools: ["listOpenRoles", "listCandidates", "getWorkforceToday", "getLeaveOverview", "searchKnowledge"], description: "Attendance, leave and onboarding coordination from HR records.", capabilities: ["Attendance and leave overview", "Onboarding checklists"], limits: ["Cannot change employee records, pay or contracts"] }),
  e({ slug: "recruiter", name: "AI Recruiter", jobTitle: "AI Recruiting Specialist", level: "SPECIALIST", department: "people", manager: "chro", requires: "employees:view", skills: ["Recruiting"], tools: ["listOpenRoles", "listCandidates", "screenCandidate", "searchKnowledge", "draftEmail"], description: "Job descriptions, interview plans and candidate communication drafts.", capabilities: ["Job descriptions", "Interview plans", "Candidate email drafts"], limits: ["No applicant tracking system is connected: cannot screen real candidates automatically"] }),
  e({ slug: "people-ops", name: "AI People Operations Specialist", jobTitle: "AI People Operations Specialist", level: "SPECIALIST", department: "people", manager: "hr-manager", requires: "employees:view", skills: ["People operations"], tools: ["getWorkforceToday", "getLeaveOverview", "createNotification"], description: "People operations: attendance follow-ups and team notifications.", capabilities: ["Attendance follow-ups", "Team notifications"], limits: ["Notifications follow the approval policy"] }),

  // ─── Legal & risk ───
  e({ slug: "legal-ops", name: "AI Legal Operations Specialist", jobTitle: "AI Legal Operations Specialist", level: "SPECIALIST", department: "legal", manager: "clo", requires: "contracts:view", skills: ["Document workflow"], tools: ["getComplianceRegister", "searchProposals", "searchKnowledge"], description: "Contract and proposal document workflow tracking and checklists.", capabilities: ["Document checklists"], limits: ["Not legal advice; cannot change or sign contracts"] }),
  e({ slug: "compliance-officer", name: "AI Compliance & Risk Officer", jobTitle: "AI Compliance & Risk Officer", level: "SPECIALIST", department: "legal", manager: "clo", requires: "contracts:view", skills: ["Compliance", "Risk"], tools: ["getComplianceRegister", "getRiskRegister", "proposeRisk", "searchKnowledge", "getInsights", "countApprovals"], description: "Compliance checklists, policy monitoring and risk escalation from company records.", capabilities: ["Compliance checklists", "Risk register input"], limits: ["Escalates; never decides regulated matters"] }),

  // ─── Regional leaders ───
  ...(["na", "eu", "mena", "asia", "india"] as const).map((r) => {
    const name = { na: "North America", eu: "UK & Europe", mena: "Middle East & North Africa", asia: "Asia", india: "India" }[r];
    return e({ slug: `region-${r}`, name: `AI Regional Director, ${name}`, jobTitle: `AI Regional Director — ${name}`, level: "DIRECTOR", department: "regional", manager: "ceo", region: r, requires: "leads:view", skills: ["Regional markets", "Regional pipeline"], tools: ["getRegionalPerformance", "searchLeads", "countLeads", "getLeadGenFunnel", "searchCampaigns", "searchDeals", "webResearch", ...MGMT], description: `Monitors ${name}: regional leads, pipeline, campaigns and market opportunities from records whose country is in the region.`, capabilities: ["Regional performance", "Regional opportunities", "Local market research"], limits: ["Regional numbers exist only for records with a country"] });
  }),
];

export const orgEmployee = (slug: string) => ORG_EMPLOYEES.find((x) => x.slug === slug);

/** Placement for any employee (core or new). */
export function placementOf(slug: string): Placement | null {
  const core = CORE_PLACEMENT[slug];
  if (core) return core;
  const o = orgEmployee(slug);
  return o ? { level: o.level, department: o.department, manager: o.manager, region: o.region, skills: o.skills } : null;
}

/** Stable employee code: core employees first (catalogue order), then the organisation list. */
export function employeeCodes(coreSlugs: string[]): Map<string, string> {
  return new Map([...coreSlugs, ...ORG_EMPLOYEES.map((o) => o.slug)].map((s, i) => [s, `AI-${String(i + 1).padStart(4, "0")}`]));
}

/* ───────────────────────── org chart maths (pure) ───────────────────────── */

export type ManagerMap = Map<string, string | null>;

/** Every employee below `slug` (direct and indirect). */
export function subtreeOf(slug: string, managers: ManagerMap): Set<string> {
  const out = new Set<string>();
  const queue = [slug];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const [s, m] of managers) if (m === cur && !out.has(s) && s !== slug) {
      out.add(s);
      queue.push(s);
    }
  }
  return out;
}

/** Chain of managers above `slug`, nearest first (stops on cycles). */
export function chainOf(slug: string, managers: ManagerMap): string[] {
  const out: string[] = [];
  let cur = managers.get(slug) ?? null;
  while (cur && !out.includes(cur) && cur !== slug) {
    out.push(cur);
    cur = managers.get(cur) ?? null;
  }
  return out;
}

/**
 * Who may an employee hand work to? Delegation goes DOWN the org chart; help requests may also go to peers (same
 * manager). Nobody delegates upward — that is an escalation.
 */
export function canDelegate(from: string, to: string, managers: ManagerMap, kind: "DELEGATION" | "HELP_REQUEST" = "DELEGATION"): boolean {
  if (from === to || !managers.has(to)) return false;
  if (subtreeOf(from, managers).has(to)) return true;
  if (kind === "HELP_REQUEST") {
    const m = managers.get(from) ?? null;
    return m !== null && managers.get(to) === m;
  }
  return false;
}

/** Detects a reporting cycle (would make the org chart unusable). */
export function hasCycle(managers: ManagerMap): boolean {
  for (const s of managers.keys()) {
    const seen = new Set<string>([s]);
    let cur = managers.get(s) ?? null;
    while (cur) {
      if (seen.has(cur)) return true;
      seen.add(cur);
      cur = managers.get(cur) ?? null;
    }
  }
  return false;
}

/* ───────────────────────── company configuration (Phase 26) ───────────────────────── */

export const COMPANY_TEMPLATES = {
  SOFTWARE: { label: "Software / technology services", departments: DEPARTMENTS.map((d) => d.key), terms: { client: "Client", project: "Project" } },
  SAAS: { label: "SaaS company", departments: DEPARTMENTS.map((d) => d.key), terms: { client: "Customer", project: "Implementation" } },
  BLOCKCHAIN: { label: "Blockchain / Web3 company", departments: DEPARTMENTS.map((d) => d.key), terms: { client: "Client", project: "Project" } },
  AI: { label: "AI company", departments: DEPARTMENTS.map((d) => d.key), terms: { client: "Customer", project: "Project" } },
  AGENCY: { label: "Marketing agency", departments: ["executive", "intelligence", "marketing", "leadgen", "sales", "customer", "operations", "finance", "people", "legal", "regional"], terms: { client: "Client", project: "Engagement" } },
  CONSULTING: { label: "Consulting company", departments: ["executive", "intelligence", "marketing", "leadgen", "sales", "customer", "operations", "finance", "people", "legal", "regional"], terms: { client: "Client", project: "Engagement" } },
  REAL_ESTATE: { label: "Real estate company", departments: ["executive", "intelligence", "marketing", "leadgen", "sales", "customer", "operations", "finance", "people", "legal", "regional"], terms: { client: "Client", project: "Property deal" } },
  ECOMMERCE: { label: "E-commerce company", departments: ["executive", "intelligence", "marketing", "customer", "technology", "product", "operations", "finance", "people", "legal", "regional"], terms: { client: "Customer", project: "Initiative" } },
  SERVICES: { label: "Service business", departments: ["executive", "marketing", "leadgen", "sales", "customer", "operations", "finance", "people", "legal"], terms: { client: "Client", project: "Job" } },
} as const;
export type CompanyTemplate = keyof typeof COMPANY_TEMPLATES;
export const TEMPLATE_KEYS = Object.keys(COMPANY_TEMPLATES) as CompanyTemplate[];

export interface CompanyProfile {
  name: string;
  template: CompanyTemplate;
  /** Departments switched on (a subset of DEPARTMENTS). Executive office is always on. */
  departments: string[];
  /** Strict approval mode: every AI change goes to the Approval Center (no autonomous or instant actions). */
  strictApprovals: boolean;
  /** Most tasks the AI company may create by delegation per day (runaway protection). */
  dailyDelegationLimit: number;
  /** Most tasks one objective may contain. */
  objectiveTaskLimit: number;
}

export const DEFAULT_PROFILE: CompanyProfile = { name: "Shivacha Technologies", template: "SOFTWARE", departments: DEPARTMENTS.map((d) => d.key), strictApprovals: false, dailyDelegationLimit: 200, objectiveTaskLimit: 60 };

export function parseCompanyProfile(v: unknown): CompanyProfile {
  const o = v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  const template = TEMPLATE_KEYS.includes(o.template as CompanyTemplate) ? (o.template as CompanyTemplate) : DEFAULT_PROFILE.template;
  const keys = new Set(DEPARTMENTS.map((d) => d.key));
  const deps = Array.isArray(o.departments) ? o.departments.map(String).filter((k) => keys.has(k)) : [...COMPANY_TEMPLATES[template].departments];
  const int = (x: unknown, d: number, min: number, max: number) => (typeof x === "number" && Number.isInteger(x) && x >= min && x <= max ? x : d);
  return {
    name: typeof o.name === "string" && o.name.trim() ? o.name.trim().slice(0, 120) : DEFAULT_PROFILE.name,
    template,
    departments: [...new Set(["executive", ...deps])],
    strictApprovals: o.strictApprovals === true,
    dailyDelegationLimit: int(o.dailyDelegationLimit, DEFAULT_PROFILE.dailyDelegationLimit, 1, 5000),
    objectiveTaskLimit: int(o.objectiveTaskLimit, DEFAULT_PROFILE.objectiveTaskLimit, 3, 500),
  };
}

/* ───────────────────────── governance (Phase 20) ───────────────────────── */

export type RiskTier = "LOW" | "MEDIUM" | "HIGH";

/** Company risk tier for a tool: reads and plain drafts are LOW; internal changes MEDIUM; external/irreversible HIGH. */
export function riskTier(t: { kind: "read" | "draft" | "write"; risk: string; alwaysApprove?: boolean; stores?: boolean }): RiskTier {
  if (t.alwaysApprove || t.risk === "HIGH" || t.risk === "CRITICAL") return "HIGH";
  if (t.kind === "write" || t.stores) return "MEDIUM";
  return "LOW";
}
