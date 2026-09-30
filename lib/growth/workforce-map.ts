/**
 * The 24 growth-department responsibilities, each owned by an EXISTING AI employee (lib/ai/catalog.ts). No new agents
 * are created: the growth department is a set of duties and tools given to the workforce that already exists.
 */
export interface GrowthRole {
  key: string;
  title: string;
  agent: string;
  /** Existing or growth tools the owner uses. */
  tools: string[];
  /** Human approval is required before anything leaves the company. */
  approval: boolean;
}

export const GROWTH_ROLES: GrowthRole[] = [
  { key: "cmo", title: "Chief Growth Officer (strategy & daily plan)", agent: "ceo", tools: ["getGrowthSummary", "getBusinessSummary"], approval: false },
  { key: "demand", title: "Demand generation manager", agent: "marketing", tools: ["getGrowthSummary", "searchCampaigns", "getMarketingSummary"], approval: false },
  { key: "icp", title: "ICP & market analyst", agent: "research", tools: ["webResearch", "getGrowthSummary"], approval: false },
  { key: "offer", title: "Offer strategist (services & products)", agent: "marketing", tools: ["getContentInventory"], approval: false },
  { key: "social", title: "Social media manager", agent: "marketing", tools: ["draftSocialPost", "listSocialPosts"], approval: true },
  { key: "linkedin", title: "LinkedIn specialist", agent: "marketing", tools: ["draftSocialPost"], approval: true },
  { key: "instagram", title: "Instagram & reels specialist", agent: "marketing", tools: ["draftSocialPost"], approval: true },
  { key: "youtube", title: "YouTube & video scripts (upload is manual)", agent: "marketing", tools: ["draftContentAsset"], approval: true },
  { key: "x", title: "X (Twitter) specialist", agent: "marketing", tools: ["draftSocialPost"], approval: true },
  { key: "copy", title: "Copywriter (EN / HI / Hinglish)", agent: "marketing", tools: ["draftContentAsset", "draftSocialPost"], approval: true },
  { key: "creative", title: "Creative briefs (no image generation)", agent: "marketing", tools: ["draftContentAsset"], approval: true },
  { key: "repurpose", title: "Content repurposing editor", agent: "marketing", tools: ["draftContentAsset", "draftSocialPost"], approval: true },
  { key: "qa", title: "Brand & content QA", agent: "marketing", tools: ["listSocialPosts"], approval: false },
  { key: "seo", title: "SEO strategist", agent: "marketing", tools: ["getContentInventory", "getVisitorSummary"], approval: false },
  { key: "trend", title: "Trend researcher", agent: "research", tools: ["webResearch"], approval: false },
  { key: "community", title: "Community reply drafts (sent by a person)", agent: "customer-success", tools: ["searchKnowledge"], approval: true },
  { key: "sdr", title: "SDR / outbound specialist", agent: "sdr", tools: ["listProspects", "draftEmail", "sendEmail"], approval: true },
  { key: "qualify", title: "Lead qualification analyst", agent: "sdr", tools: ["qualifyLead", "searchLeads", "listHighIntentVisitors"], approval: false },
  { key: "nurture", title: "Email nurture manager", agent: "sdr", tools: ["draftEmail"], approval: true },
  { key: "sales", title: "AI sales follow-up", agent: "sales", tools: ["searchLeads", "createFollowUp", "draftEmail"], approval: true },
  { key: "crm", title: "CRM hygiene & dedupe", agent: "crm", tools: ["findDuplicates", "findDataGaps"], approval: true },
  { key: "partners", title: "Partnerships manager", agent: "research", tools: ["webResearch"], approval: true },
  { key: "ads", title: "Paid ads analyst (reads spend; ad actions run through the Advertising OS policy)", agent: "marketing", tools: ["getGrowthSummary", "searchCampaigns"], approval: true },
  { key: "analytics", title: "Growth analytics & attribution", agent: "marketing", tools: ["getGrowthSummary", "getMarketingSummary"], approval: false },
];
