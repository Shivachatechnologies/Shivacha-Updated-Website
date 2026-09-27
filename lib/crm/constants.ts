/** Shared CRM / sales constants (safe to import from client components). */

/** Lead pipeline columns. PROPOSAL_SENT is shown as "Proposal"; ON_HOLD is kept for existing records. */
export const PIPELINE = [
  { key: "NEW", label: "New" },
  { key: "CONTACTED", label: "Contacted" },
  { key: "QUALIFIED", label: "Qualified" },
  { key: "MEETING", label: "Meeting" },
  { key: "PROPOSAL_SENT", label: "Proposal" },
  { key: "NEGOTIATION", label: "Negotiation" },
  { key: "WON", label: "Won" },
  { key: "LOST", label: "Lost" },
] as const;

export const LIFECYCLE_STAGES = ["LEAD", "MQL", "SQL", "OPPORTUNITY", "CUSTOMER", "EVANGELIST", "DISQUALIFIED"] as const;

export const DEAL_STAGES = ["DISCOVERY", "QUALIFICATION", "SOLUTION", "PROPOSAL", "NEGOTIATION", "CONTRACT", "WON", "LOST"] as const;
export type DealStageName = (typeof DEAL_STAGES)[number];
export const OPEN_DEAL_STAGES = DEAL_STAGES.filter((s) => s !== "WON" && s !== "LOST");

/** Default win probability per deal stage (used when the stage changes, unless overridden). */
export const STAGE_PROBABILITY: Record<DealStageName, number> = { DISCOVERY: 10, QUALIFICATION: 20, SOLUTION: 40, PROPOSAL: 60, NEGOTIATION: 75, CONTRACT: 90, WON: 100, LOST: 0 };
