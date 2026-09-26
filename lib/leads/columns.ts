import type { LeadRecord } from "./types";

/** Column layout of the lead database. Order matters: it is the Google Sheet column order. */
export const LEAD_COLUMNS: { header: string; value: (l: LeadRecord) => string | number }[] = [
  { header: "Lead ID", value: (l) => l.id },
  { header: "Date & Time (UTC)", value: (l) => l.createdAt.replace("T", " ").slice(0, 19) },
  { header: "Name", value: (l) => l.name },
  { header: "Email", value: (l) => l.email },
  { header: "Phone", value: (l) => l.phone },
  { header: "Company", value: (l) => l.company },
  { header: "Country", value: (l) => l.country },
  { header: "Service", value: (l) => l.service },
  { header: "Budget", value: (l) => l.budget },
  { header: "Project Description", value: (l) => l.description },
  { header: "Source Page", value: (l) => l.sourcePage },
  { header: "Landing Page", value: (l) => l.landingPage },
  { header: "UTM Source", value: (l) => l.utmSource },
  { header: "UTM Medium", value: (l) => l.utmMedium },
  { header: "UTM Campaign", value: (l) => l.utmCampaign },
  { header: "Lead Score", value: (l) => l.score },
  { header: "Lead Status", value: (l) => l.status },
  { header: "Assigned Sales Person", value: (l) => l.assignedTo },
  { header: "Notes", value: (l) => l.notes },
  { header: "Last Contacted", value: (l) => l.lastContacted },
  { header: "Next Follow-up (UTC)", value: (l) => l.nextFollowUp.replace("T", " ").slice(0, 16) },
  { header: "Score Label", value: (l) => l.scoreLabel },
  { header: "Form", value: (l) => l.formType },
  { header: "Referrer", value: (l) => l.referrer },
  { header: "Extra Details", value: (l) => Object.entries(l.extra).map(([k, v]) => `${k}: ${v}`).join("\n") },
];

export const STATUS_COLUMN_INDEX = LEAD_COLUMNS.findIndex((c) => c.header === "Lead Status");

/** Prevent spreadsheet formula injection for any consumer that re-imports the data. */
export const safeCell = (v: string | number) => (typeof v === "string" && /^[=+\-@\t\r]/.test(v) ? `'${v}` : v);
