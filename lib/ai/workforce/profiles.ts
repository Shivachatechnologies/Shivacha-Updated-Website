/**
 * Digital employee definitions (pure — no database access). The twelve AI agents in the catalogue are the company's
 * AI employees; these defaults give each one a job title, department, reporting line, responsibilities and starter
 * goals. Everything here can be changed per employee in the profile's Settings and Goals tabs.
 */
import { DEPARTMENTS, orgEmployee } from "@/lib/company/org";

export const EMPLOYEE_STATUSES = ["ONLINE", "WORKING", "WAITING", "AWAITING_APPROVAL", "OFFLINE", "ERROR"] as const;
export type EmployeeStatus = (typeof EMPLOYEE_STATUSES)[number];

export const TASK_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const TASK_KINDS = { TASK: "Assigned task", INSTRUCTION: "CEO instruction", RECURRING: "Recurring responsibility", OBJECTIVE: "Company objective" } as const;

/** Tasks still on an employee's desk. */
export const OPEN_TASK_STATUSES = ["QUEUED", "RUNNING", "PAUSED", "AWAITING_APPROVAL", "WAITING"] as const;

export interface GoalDefault {
  label: string;
  metric: string;
  target: number;
  period: "DAILY" | "WEEKLY" | "MONTHLY";
}

export interface EmployeeProfile {
  jobTitle: string;
  department: string;
  reportsTo: string | null;
  responsibilities: string[];
  goals: GoalDefault[];
}

const done = (target: number, period: GoalDefault["period"] = "DAILY"): GoalDefault => ({ label: "Tasks completed", metric: "tasks_completed", target, period });

export const EMPLOYEE_PROFILES: Record<string, EmployeeProfile> = {
  ceo: { jobTitle: "AI Chief of Staff", department: "Executive", reportsTo: null, responsibilities: ["Daily CEO briefing", "Company-wide risk monitoring", "Cross-department recommendations", "Escalations to the CEO"], goals: [done(3)] },
  sales: { jobTitle: "AI Sales Executive", department: "Sales", reportsTo: "ceo", responsibilities: ["Lead qualification", "Pipeline reviews", "Follow-up planning", "Meeting briefs", "Stalled deal recovery"], goals: [done(5), { label: "Follow-ups created", metric: "actions:createFollowUp", target: 12, period: "DAILY" }] },
  sdr: { jobTitle: "AI Sales Development Representative", department: "Sales", reportsTo: "sales", responsibilities: ["Prospecting", "Lead qualification", "CRM updates", "Follow-ups", "Opportunity creation"], goals: [{ label: "Prospects added", metric: "actions:createLead", target: 50, period: "DAILY" }, { label: "Qualified leads", metric: "actions:updateLead", target: 20, period: "DAILY" }, { label: "Follow-ups", metric: "actions:createFollowUp", target: 10, period: "DAILY" }] },
  crm: { jobTitle: "AI CRM Operations Specialist", department: "Sales Operations", reportsTo: "sales", responsibilities: ["Duplicate detection", "Data quality", "Stale lead clean-up", "Overdue follow-up tracking", "Ownership suggestions"], goals: [done(4), { label: "Lead records updated", metric: "actions:updateLead", target: 20, period: "DAILY" }] },
  proposal: { jobTitle: "AI Proposal Writer", department: "Sales", reportsTo: "sales", responsibilities: ["Proposal drafts", "Scope & deliverables", "Timelines & milestones", "Payment schedules"], goals: [{ label: "Proposal drafts", metric: "actions:createProposalDraft", target: 3, period: "WEEKLY" }] },
  marketing: { jobTitle: "AI Marketing Analyst", department: "Marketing", reportsTo: "ceo", responsibilities: ["Campaign analysis", "Weekly marketing plan", "SEO & content opportunities", "Market & service performance"], goals: [done(5, "WEEKLY")] },
  project: { jobTitle: "AI Project Coordinator", department: "Delivery", reportsTo: "ceo", responsibilities: ["Overdue task tracking", "Milestone risk", "Blockers & scope creep", "Status summaries", "Client update drafts"], goals: [done(3), { label: "Project tasks created", metric: "actions:createTask", target: 5, period: "DAILY" }] },
  "customer-success": { jobTitle: "AI Customer Success Manager", department: "Customer Success", reportsTo: "ceo", responsibilities: ["Account health", "Delivery & payment risk", "Meeting briefs", "Expansion opportunities"], goals: [done(3)] },
  support: { jobTitle: "AI Support Specialist", department: "Support", reportsTo: "customer-success", responsibilities: ["Ticket triage", "Ticket summaries", "Reply drafts", "SLA risk monitoring", "Duplicate issues"], goals: [done(6), { label: "Tickets updated", metric: "actions:updateTicket", target: 10, period: "DAILY" }] },
  finance: { jobTitle: "AI Finance Analyst", department: "Finance", reportsTo: "ceo", responsibilities: ["Overdue invoice review", "Revenue summaries", "Payment history", "Unusual patterns", "Payment reminder drafts (approval required)"], goals: [done(2)] },
  research: { jobTitle: "AI Research Analyst", department: "Strategy", reportsTo: "ceo", responsibilities: ["Company research", "Market research", "Competitor research", "Technology research"], goals: [done(3)] },
  knowledge: { jobTitle: "AI Knowledge Manager", department: "Operations", reportsTo: "ceo", responsibilities: ["Knowledge answers with citations", "Policy & playbook lookups"], goals: [done(5)] },
};

/** Profiles for the AI company organisation (lib/company/org.ts): title, department, manager and a weekly starter goal. */
function orgProfile(slug: string): EmployeeProfile | null {
  const o = orgEmployee(slug);
  if (!o) return null;
  return { jobTitle: o.jobTitle, department: DEPARTMENTS.find((d) => d.key === o.department)?.name ?? "Operations", reportsTo: o.manager, responsibilities: o.capabilities, goals: [done(3, "WEEKLY")] };
}

export const profileFor = (slug: string): EmployeeProfile => EMPLOYEE_PROFILES[slug] ?? orgProfile(slug) ?? { jobTitle: "AI Employee", department: "Operations", reportsTo: "ceo", responsibilities: [], goals: [] };

/** Human-language permission names for each tool, shown on the Permissions tab. */
export const TOOL_PERMISSION_LABELS: Record<string, string> = {
  getBusinessSummary: "Read company KPIs",
  searchLeads: "Read leads",
  getLead: "Read lead details",
  searchDeals: "Read deals",
  getDeal: "Read deal details",
  getPipelineSummary: "Read pipeline",
  searchInvoices: "Read invoices",
  getInvoice: "Read invoice details",
  getFinanceSummary: "Read finance summary",
  searchProjects: "Read projects",
  getProject: "Read project details",
  searchTickets: "Read support tickets",
  getTicket: "Read ticket details",
  getMarketingSummary: "Read marketing summary",
  searchCampaigns: "Read campaigns",
  getContentInventory: "Read website content",
  getInsights: "Read AI insights",
  recommendServices: "Read service catalogue",
  searchKnowledge: "Read knowledge base",
  findDuplicates: "Find duplicate records",
  findDataGaps: "Find missing data",
  getOverdueFollowUps: "Read overdue follow-ups",
  searchClients: "Read clients",
  getClient: "Read client details",
  webResearch: "Research the public web",
  draftEmail: "Draft emails",
  draftProjectUpdate: "Draft project updates",
  draftTicketReply: "Draft ticket replies",
  createNotification: "Notify team members",
  createLeadActivity: "Add notes to leads",
  createFollowUp: "Create follow-ups",
  createTask: "Create tasks",
  createLead: "Create leads",
  updateLead: "Update leads",
  sendEmail: "Send external email",
  createProposalDraft: "Create proposal drafts",
  updateTicket: "Update support tickets",
  getOrgChart: "Read the AI organisation",
  getObjectiveStatus: "Read company objectives",
  getRegionalPerformance: "Read regional performance",
  getWorkforcePerformance: "Read AI workforce performance",
  getLeadGenFunnel: "Read the lead generation funnel",
  runLeadPipeline: "Run lead generation (uses provider credits)",
  recordMarketFinding: "Record market research findings",
  completeMarketResearch: "Save market research to the Knowledge Base (draft)",
  getAdCampaigns: "Read paid-media campaigns",
  getSocialPerformance: "Read social strategy and post performance",
  getProviderBlockers: "Read which providers are connected and what blocks an objective",
  getSalesPriorities: "Read lead priorities",
  getNextBestActions: "Read next best sales actions",
  getDealRisks: "Read deal risk",
  getSalesForecast: "Read the sales forecast",
  getProjectHealth: "Read project health",
  getClientHealth: "Read client health",
  getCollectionsQueue: "Read overdue invoices",
  listOpenRoles: "Read open roles",
  listCandidates: "Read candidates",
  screenCandidate: "Save a candidate screening draft",
  listPurchaseRequests: "Read vendors and purchase requests",
  proposePurchaseRequest: "Propose purchase requests (approval)",
  getComplianceRegister: "Read the compliance register",
  getRiskRegister: "Read the risk register",
  proposeRisk: "Propose risk entries (approval)",
  enrollProspectsInSequence: "Enrol prospects in outreach (approval)",
  proposeAdCampaign: "Propose ad campaigns (created paused, approval)",
  requestAdLaunch: "Request an ad launch (approval or autonomous policy)",
  launchAdCampaign: "Launch ad campaigns (spends money, approval)",
  pauseAdCampaign: "Pause ad campaigns",
  changeAdBudget: "Change ad budgets (approval)",
};

export const permissionLabel = (tool: string) => TOOL_PERMISSION_LABELS[tool] ?? tool;

/**
 * Action classes that always need a person, whatever an employee's settings say. Tools for payments, refunds,
 * contract changes, deletions and publishing do not exist in the AI toolset at all, so no employee can do them.
 */
export const HUMAN_APPROVAL_RULES = [
  "Sending external email or WhatsApp messages",
  "Creating financial transactions or payments",
  "Refunds",
  "Changing contracts",
  "Deleting records",
  "Publishing public content",
];

/** Metrics a goal can track. `actions:<tool>` counts executed (autonomous or approved) actions of that tool. */
export function goalMetricOptions(tools: string[], writeTools: Set<string>): [string, string][] {
  return [["tasks_completed", "Tasks completed"], ...tools.filter((t) => writeTools.has(t)).map((t) => [`actions:${t}`, `${permissionLabel(t)} (executed)`] as [string, string])];
}

export const MEMORY_KINDS = { INSTRUCTION: "Instruction", PREFERENCE: "Preference", TASK: "Previous task", WORKFLOW_SUCCESS: "Successful workflow", WORKFLOW_FAILURE: "Failed workflow", KNOWLEDGE: "Company knowledge", RECORD: "Relevant record" } as const;
export type MemoryKind = keyof typeof MEMORY_KINDS;

/** Recurring schedules available to AI employees (Automation triggers emitted by the workforce scheduler). */
export const SCHEDULES = {
  SCHEDULE_MORNING: "Every morning",
  SCHEDULE_EVENING: "Every evening",
  SCHEDULE_WEEKLY_MONDAY: "Every Monday",
  SCHEDULE_CONTINUOUS: "Continuously (every scheduler tick)",
} as const;
export type ScheduleTrigger = keyof typeof SCHEDULES;

export interface Subtask {
  title: string;
  status: "pending" | "running" | "done" | "failed" | "skipped";
  note?: string;
}

export function parseSubtasks(v: unknown): Subtask[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is Record<string, unknown> => !!x && typeof x === "object" && typeof (x as Record<string, unknown>).title === "string")
    .map((x) => ({ title: String(x.title).slice(0, 200), status: (["pending", "running", "done", "failed", "skipped"].includes(String(x.status)) ? x.status : "pending") as Subtask["status"], note: typeof x.note === "string" ? x.note.slice(0, 500) : undefined }));
}

/** Progress from subtasks: finished (done/skipped/failed) share of the plan, capped at 95 until the task completes. */
export function progressOf(subtasks: Subtask[], complete = false) {
  if (complete) return 100;
  if (!subtasks.length) return 5;
  const finished = subtasks.filter((s) => s.status !== "pending" && s.status !== "running").length;
  const running = subtasks.some((s) => s.status === "running") ? 0.5 : 0;
  return Math.max(5, Math.min(95, Math.round(((finished + running) / subtasks.length) * 100)));
}

/** Business-day helpers in the workforce time zone (WORKFORCE_TIMEZONE, default Asia/Kolkata). */
export const workforceTimeZone = () => process.env.WORKFORCE_TIMEZONE || "Asia/Kolkata";

export function localParts(d = new Date(), tz = workforceTimeZone()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", weekday: "short", hourCycle: "h23" }).formatToParts(d).map((p) => [p.type, p.value]));
  return { day: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour), weekday: String(parts.weekday) };
}

/** UTC instant of local midnight for the business day containing `d`. */
export function startOfLocalDay(d = new Date(), tz = workforceTimeZone()) {
  const { day } = localParts(d, tz);
  const utcMidnight = new Date(`${day}T00:00:00Z`);
  // Offset of the zone at that instant (minutes), derived without a timezone library.
  const asLocal = new Date(utcMidnight.toLocaleString("en-US", { timeZone: tz }));
  const asUtc = new Date(utcMidnight.toLocaleString("en-US", { timeZone: "UTC" }));
  return new Date(utcMidnight.getTime() - (asLocal.getTime() - asUtc.getTime()));
}

export function periodStart(period: string, now = new Date()) {
  const today = startOfLocalDay(now);
  if (period === "WEEKLY") {
    const { weekday } = localParts(now);
    const back = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(weekday);
    return new Date(today.getTime() - Math.max(0, back) * 86400_000);
  }
  if (period === "MONTHLY") {
    const { day } = localParts(now);
    return startOfLocalDay(new Date(`${day.slice(0, 8)}01T12:00:00Z`));
  }
  return today;
}
