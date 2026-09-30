import "server-only";
import { db } from "@/lib/db/client";
import { OPEN_DEAL_STAGES } from "@/lib/crm/constants";

/**
 * Sales intelligence from live CRM records (leads, deals, proposals, follow-ups, visitor intent). Every score is a
 * transparent sum of named signals; forecasts are labelled ESTIMATED because they multiply real values by stage
 * probabilities. Nothing here writes data — actions go through the existing tools and approval policy.
 */

const DAY = 86400_000;
const days = (from: Date, to = new Date()) => Math.floor((to.getTime() - from.getTime()) / DAY);
const PRIORITY_W: Record<string, number> = { URGENT: 20, HIGH: 12, MEDIUM: 5, LOW: 0 };

export interface LeadPriority {
  id: string;
  name: string;
  company: string | null;
  score: number;
  reasons: string[];
  href: string;
}

/** Open leads ranked by qualification score, intent, priority, freshness and overdue follow-up. */
export async function leadPriorities(limit = 20): Promise<LeadPriority[]> {
  const leads = await db.lead.findMany({ where: { archivedAt: null, mergedIntoId: null, status: { notIn: ["WON", "LOST"] } }, orderBy: [{ growthScore: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }], take: 300, select: { id: true, name: true, company: true, growthScore: true, growthTier: true, priority: true, createdAt: true, lastContactedAt: true, nextFollowUpAt: true, visitors: { select: { intentScore: true } } } });
  const now = new Date();
  return leads
    .map((l) => {
      const reasons: string[] = [];
      let score = 0;
      if (l.growthScore != null) {
        score += l.growthScore * 0.5;
        reasons.push(`qualification ${l.growthScore}${l.growthTier ? ` (${l.growthTier.toLowerCase().replace("_", "-")})` : ""}`);
      }
      const intent = Math.max(0, ...l.visitors.map((v) => v.intentScore));
      if (intent) {
        score += Math.min(20, intent / 5);
        reasons.push(`website intent ${intent}`);
      }
      score += PRIORITY_W[l.priority] ?? 0;
      if (PRIORITY_W[l.priority]) reasons.push(`${l.priority.toLowerCase()} priority`);
      const age = days(l.createdAt, now);
      if (age <= 2 && !l.lastContactedAt) {
        score += 10;
        reasons.push("new and not contacted yet");
      }
      if (l.nextFollowUpAt && l.nextFollowUpAt < now) {
        score += 8;
        reasons.push(`follow-up overdue ${days(l.nextFollowUpAt, now)}d`);
      }
      return { id: l.id, name: l.name, company: l.company, score: Math.round(score), reasons, href: `/admin/leads/${l.id}` };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export interface NextAction {
  kind: "CONTACT" | "FOLLOW_UP" | "PROPOSAL" | "REENGAGE" | "CLOSE_DATE" | "MEETING_PREP";
  title: string;
  why: string;
  owner: string;
  href: string;
}

/** Deterministic next-best-actions from the state of each record. */
export async function nextBestActions(limit = 30): Promise<NextAction[]> {
  const now = new Date();
  const [fresh, overdue, deals, meetings] = await Promise.all([
    db.lead.findMany({ where: { archivedAt: null, status: "NEW", lastContactedAt: null, createdAt: { lt: new Date(now.getTime() - 2 * DAY) } }, orderBy: { createdAt: "asc" }, take: 15, select: { id: true, name: true, createdAt: true } }),
    db.followUp.findMany({ where: { status: "PENDING", dueAt: { lt: now } }, orderBy: { dueAt: "asc" }, take: 15, select: { id: true, dueAt: true, lead: { select: { id: true, name: true } } } }),
    db.deal.findMany({ where: { deletedAt: null, stage: { in: [...OPEN_DEAL_STAGES] } }, select: { id: true, number: true, name: true, stage: true, stageChangedAt: true, expectedCloseDate: true, _count: { select: { proposals: true } } } }),
    db.lead.findMany({ where: { archivedAt: null, status: "MEETING" }, take: 10, select: { id: true, name: true } }),
  ]);
  const out: NextAction[] = [];
  for (const l of fresh) out.push({ kind: "CONTACT", title: `Contact ${l.name}`, why: `New lead waiting ${days(l.createdAt, now)} days with no contact`, owner: "sdr", href: `/admin/leads/${l.id}` });
  for (const f of overdue) out.push({ kind: "FOLLOW_UP", title: `Follow up with ${f.lead.name}`, why: `Follow-up due ${days(f.dueAt, now)} days ago`, owner: "sales", href: `/admin/leads/${f.lead.id}` });
  for (const d of deals) {
    if (["PROPOSAL", "NEGOTIATION", "CONTRACT"].includes(d.stage) && !d._count.proposals) out.push({ kind: "PROPOSAL", title: `Prepare a proposal for ${d.number}`, why: `Deal is in ${d.stage.toLowerCase()} with no proposal`, owner: "proposal", href: `/admin/deals/${d.id}` });
    else if (days(d.stageChangedAt, now) > 14) out.push({ kind: "REENGAGE", title: `Re-engage ${d.number} ${d.name}`, why: `No stage change for ${days(d.stageChangedAt, now)} days`, owner: "sales", href: `/admin/deals/${d.id}` });
    if (d.expectedCloseDate && d.expectedCloseDate < now) out.push({ kind: "CLOSE_DATE", title: `Update close date of ${d.number}`, why: `Expected close ${d.expectedCloseDate.toISOString().slice(0, 10)} has passed`, owner: "sales-director", href: `/admin/deals/${d.id}` });
  }
  for (const m of meetings) out.push({ kind: "MEETING_PREP", title: `Prepare the meeting brief for ${m.name}`, why: "Lead is at the meeting stage", owner: "sales", href: `/admin/leads/${m.id}` });
  return out.slice(0, limit);
}

export interface DealRisk {
  id: string;
  number: string;
  name: string;
  stage: string;
  value: number;
  currency: string;
  risk: number;
  signals: string[];
  href: string;
}

/** Risk 0–100 for open deals: stalled time, passed close date, late stage without proposal, low probability. */
export async function dealRisks(limit = 20): Promise<DealRisk[]> {
  const now = new Date();
  const deals = await db.deal.findMany({ where: { deletedAt: null, stage: { in: [...OPEN_DEAL_STAGES] } }, select: { id: true, number: true, name: true, stage: true, value: true, currency: true, probability: true, stageChangedAt: true, expectedCloseDate: true, updatedAt: true, _count: { select: { proposals: true } } } });
  return deals
    .map((d) => {
      const signals: string[] = [];
      let risk = 0;
      const stalled = days(d.stageChangedAt, now);
      if (stalled > 30) {
        risk += 40;
        signals.push(`stalled ${stalled}d`);
      } else if (stalled > 14) {
        risk += 20;
        signals.push(`stalled ${stalled}d`);
      }
      if (d.expectedCloseDate && d.expectedCloseDate < now) {
        risk += 25;
        signals.push("close date passed");
      }
      if (["NEGOTIATION", "CONTRACT"].includes(d.stage) && !d._count.proposals) {
        risk += 20;
        signals.push("late stage without proposal");
      }
      if (d.probability < 25) {
        risk += 10;
        signals.push(`probability ${d.probability}%`);
      }
      if (days(d.updatedAt, now) > 21) {
        risk += 10;
        signals.push(`no update ${days(d.updatedAt, now)}d`);
      }
      return { id: d.id, number: d.number, name: d.name, stage: d.stage, value: Number(d.value), currency: d.currency, risk: Math.min(100, risk), signals, href: `/admin/deals/${d.id}` };
    })
    .filter((d) => d.risk > 0)
    .sort((a, b) => b.risk - a.risk || b.value - a.value)
    .slice(0, limit);
}

export interface ForecastRow {
  month: string;
  currency: string;
  deals: number;
  pipeline: number;
  weighted: number;
}

/**
 * ESTIMATED forecast: open deals by expected close month (next 3 months + no date), value × stage probability, per
 * currency. The historical win rate over 12 months (REAL) is returned next to it for calibration.
 */
export async function salesForecast(): Promise<{ rows: ForecastRow[]; winRate: number | null; closed: number }> {
  const now = new Date();
  const [deals, won, lost] = await Promise.all([
    db.deal.findMany({ where: { deletedAt: null, stage: { in: [...OPEN_DEAL_STAGES] } }, select: { value: true, currency: true, probability: true, expectedCloseDate: true } }),
    db.deal.count({ where: { deletedAt: null, stage: "WON", wonAt: { gte: new Date(now.getTime() - 365 * DAY) } } }),
    db.deal.count({ where: { deletedAt: null, stage: "LOST", lostAt: { gte: new Date(now.getTime() - 365 * DAY) } } }),
  ]);
  const months = [0, 1, 2].map((i) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1)).toISOString().slice(0, 7));
  const map = new Map<string, ForecastRow>();
  for (const d of deals) {
    const m = d.expectedCloseDate ? d.expectedCloseDate.toISOString().slice(0, 7) : "no date";
    const month = d.expectedCloseDate && d.expectedCloseDate < new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)) ? "overdue" : months.includes(m) || m === "no date" ? m : "later";
    const k = `${month}|${d.currency}`;
    const r = map.get(k) ?? { month, currency: d.currency, deals: 0, pipeline: 0, weighted: 0 };
    r.deals++;
    r.pipeline += Number(d.value);
    r.weighted += (Number(d.value) * d.probability) / 100;
    map.set(k, r);
  }
  const order = ["overdue", ...months, "later", "no date"];
  const rows = [...map.values()].map((r) => ({ ...r, pipeline: Math.round(r.pipeline * 100) / 100, weighted: Math.round(r.weighted * 100) / 100 })).sort((a, b) => order.indexOf(a.month) - order.indexOf(b.month) || a.currency.localeCompare(b.currency));
  return { rows, winRate: won + lost ? Math.round((won / (won + lost)) * 1000) / 10 : null, closed: won + lost };
}
