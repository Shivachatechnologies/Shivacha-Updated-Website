/** Lead form options and CRM statuses. Shared by the client form and the server pipeline. */

export const SERVICE_OPTIONS = [
  "Web3 Development",
  "Blockchain Development",
  "FinTech Development",
  "AI Development",
  "SaaS Development",
  "Mobile App Development",
  "Web Development",
  "Smart Contract Development",
  "Crypto Exchange Development",
  "Crypto Wallet Development",
  "Dedicated Development Team",
  "Other",
] as const;

/** Budgets never gate a lead; they only inform the lead score. */
export const BUDGET_OPTIONS = ["Under $5K", "$5K–$10K", "$10K–$25K", "$25K–$50K", "$50K+", "Not Sure Yet"] as const;

export const LEAD_STATUSES = ["New", "Contacted", "Qualified", "Meeting", "Proposal", "Negotiation", "Won", "Lost", "Nurture"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

/** Attribution fields captured on the client (first touch) and stored with every lead. */
export const ATTRIBUTION_FIELDS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "landing_page", "referrer", "first_source", "first_medium", "first_campaign", "first_landing", "first_referrer", "first_seen", "device", "visits", "pages_viewed", "intent_pages"] as const;
