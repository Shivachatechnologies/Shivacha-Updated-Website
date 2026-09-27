import { z } from "zod";

/**
 * Automation rule definitions (pure — no database access, unit-tested).
 * Trigger → Conditions (all must match) → Actions (run in order) → Execution log.
 */
export const TRIGGERS = ["NEW_LEAD", "DEAL_WON", "PROPOSAL_SENT", "PROPOSAL_EXPIRING", "INVOICE_OVERDUE", "PAYMENT_RECEIVED", "TICKET_CREATED", "PROJECT_DELAYED", "FOLLOW_UP_DUE"] as const;
export type Trigger = (typeof TRIGGERS)[number];

export const TRIGGER_INFO: Record<Trigger, { label: string; entity: string; fields: string[] }> = {
  NEW_LEAD: { label: "New lead received", entity: "Lead", fields: ["lead.country", "lead.service", "lead.product", "lead.source", "lead.score", "lead.scoreLabel", "lead.priority", "lead.formType", "lead.budget"] },
  DEAL_WON: { label: "Deal won", entity: "Deal", fields: ["deal.value", "deal.currency", "deal.country", "deal.source", "deal.services"] },
  PROPOSAL_SENT: { label: "Proposal sent", entity: "Proposal", fields: ["proposal.total", "proposal.currency"] },
  PROPOSAL_EXPIRING: { label: "Proposal expiring (≤ 3 days)", entity: "Proposal", fields: ["proposal.total", "proposal.daysLeft"] },
  INVOICE_OVERDUE: { label: "Invoice overdue", entity: "Invoice", fields: ["invoice.balanceDue", "invoice.currency", "invoice.daysOverdue"] },
  PAYMENT_RECEIVED: { label: "Payment confirmed", entity: "Payment", fields: ["payment.amount", "payment.currency", "payment.provider"] },
  TICKET_CREATED: { label: "Support ticket created", entity: "Ticket", fields: ["ticket.category", "ticket.priority", "ticket.source"] },
  PROJECT_DELAYED: { label: "Project delayed", entity: "Project", fields: ["project.status", "project.daysLate", "project.health"] },
  FOLLOW_UP_DUE: { label: "Follow-up due today", entity: "FollowUp", fields: ["followUp.leadName"] },
};

export const OPS = ["eq", "neq", "gt", "gte", "lt", "lte", "contains", "in", "exists"] as const;
export const conditionSchema = z.object({ field: z.string().regex(/^[a-zA-Z]+\.[a-zA-Z]+$/, "Pick a field"), op: z.enum(OPS), value: z.string().max(300).default("") });
export type Condition = z.infer<typeof conditionSchema>;

const template = z.string().trim().max(4000);
export const ACTION_TYPES = ["CREATE_TASK", "CREATE_FOLLOWUP", "ASSIGN_OWNER", "SEND_EMAIL", "SEND_NOTIFICATION", "CREATE_TICKET", "UPDATE_STATUS", "AI_AGENT", "WEBHOOK"] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

export const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("CREATE_TASK"), title: template.min(1), assignTo: z.string().max(60).default("owner"), dueInDays: z.coerce.number().int().min(0).max(365).default(1), priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM") }),
  z.object({ type: z.literal("CREATE_FOLLOWUP"), note: template.default(""), dueInHours: z.coerce.number().int().min(0).max(24 * 60).default(24), assignTo: z.string().max(60).default("owner") }),
  z.object({ type: z.literal("ASSIGN_OWNER"), strategy: z.enum(["user", "round_robin"]), userId: z.string().max(40).default(""), role: z.string().max(40).default("SALES_MANAGER") }),
  /** recipient: owner | permission:<perm> | customer (external → always routed to the approval center) | an internal email address. */
  z.object({ type: z.literal("SEND_EMAIL"), to: z.string().trim().min(1).max(160), subject: template.min(1).max(200), body: template.min(1) }),
  z.object({ type: z.literal("SEND_NOTIFICATION"), to: z.string().trim().min(1).max(80).default("owner"), title: template.min(1).max(200), body: template.default("") }),
  z.object({ type: z.literal("CREATE_TICKET"), subject: template.min(1).max(200), priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"), category: z.enum(["BUG", "FEATURE", "TECHNICAL", "BILLING", "GENERAL", "URGENT"]).default("GENERAL") }),
  z.object({ type: z.literal("UPDATE_STATUS"), value: z.string().trim().min(1).max(40) }),
  z.object({ type: z.literal("AI_AGENT"), agent: z.string().trim().min(1).max(60), instruction: template.min(1).max(2000) }),
  z.object({ type: z.literal("WEBHOOK"), url: z.string().trim().url().max(500).refine((u) => u.startsWith("https://"), "Webhooks must use https://") }),
]);
export type AutomationAction = z.infer<typeof actionSchema>;

export const rulesSchema = z.object({ conditions: z.array(conditionSchema).max(20), actions: z.array(actionSchema).min(1, "Add at least one action").max(15) });

/** Reads a dotted path ("lead.country") from the event payload. */
export function getPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), obj);
}

const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v)) ? Number(v) : NaN);

export function matches(c: Condition, payload: unknown): boolean {
  const actual = getPath(payload, c.field);
  const want = c.value.trim();
  const a = Array.isArray(actual) ? actual.map(String) : actual == null ? null : String(actual);
  switch (c.op) {
    case "exists":
      return a != null && a !== "" && !(Array.isArray(a) && a.length === 0);
    case "eq":
      return Array.isArray(a) ? a.some((x) => x.toLowerCase() === want.toLowerCase()) : (a ?? "").toLowerCase() === want.toLowerCase();
    case "neq":
      return Array.isArray(a) ? !a.some((x) => x.toLowerCase() === want.toLowerCase()) : (a ?? "").toLowerCase() !== want.toLowerCase();
    case "contains":
      return (Array.isArray(a) ? a.join(" ") : a ?? "").toLowerCase().includes(want.toLowerCase());
    case "in": {
      const set = want.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
      return Array.isArray(a) ? a.some((x) => set.includes(x.toLowerCase())) : set.includes((a ?? "").toLowerCase());
    }
    default: {
      const x = num(actual);
      const y = num(want);
      if (Number.isNaN(x) || Number.isNaN(y)) return false;
      return c.op === "gt" ? x > y : c.op === "gte" ? x >= y : c.op === "lt" ? x < y : x <= y;
    }
  }
}

export const allMatch = (conds: Condition[], payload: unknown) => conds.every((c) => matches(c, payload));

/** {{lead.name}} placeholders. `escape` is applied to substituted values (HTML emails). */
export function render(tpl: string, payload: unknown, escape: (s: string) => string = (s) => s) {
  return tpl.replace(/\{\{\s*([a-zA-Z]+\.[a-zA-Z]+)\s*\}\}/g, (_, p: string) => {
    const v = getPath(payload, p);
    return v == null ? "" : escape(Array.isArray(v) ? v.join(", ") : String(v));
  });
}

/** Blocks webhooks to private/internal hosts (SSRF protection). */
export function isPublicHttpsUrl(u: string) {
  let url: URL;
  try {
    url = new URL(u);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password) return false;
  const h = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".internal") || h.endsWith(".local") || !h.includes(".")) return false;
  if (/^(10|127|0)\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h) || /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(h)) return false;
  if (h.includes(":")) return false; // raw IPv6 literals
  return true;
}
