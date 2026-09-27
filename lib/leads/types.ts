import type { LeadType } from "@/lib/validation";
import type { LeadStatus } from "./options";

/** One lead as stored in the lead database (Google Sheet / file) and sent in notifications. */
export interface LeadRecord {
  id: string;
  createdAt: string; // ISO 8601
  formType: LeadType;
  name: string;
  email: string;
  phone: string;
  company: string;
  country: string;
  service: string;
  budget: string;
  description: string;
  sourcePage: string;
  landingPage: string;
  referrer: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  score: number;
  scoreLabel: "Hot" | "Warm" | "Nurture";
  status: LeadStatus;
  assignedTo: string;
  notes: string;
  lastContacted: string;
  nextFollowUp: string; // ISO 8601
  /** Extra form fields (role, product, team, preferred time…) kept for context. */
  extra: Record<string, string>;
  attachments: { name: string; type: string; size: number; data: string }[];
}
