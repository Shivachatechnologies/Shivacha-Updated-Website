import "server-only";
import { db } from "@/lib/db/client";
import { can, type Permission } from "@/lib/auth/permissions";
import type { SessionUser } from "@/lib/auth/session";
import { fmtMulti } from "@/lib/os/money";
import { dealMetrics } from "@/lib/sales/deals";
import { financeSummary } from "@/lib/finance/core";
import { liveWorkforce, summarize } from "@/lib/workforce/attendance";
import { getVisitorPolicy } from "@/lib/visitors/settings";
import type { ReplyLanguage } from "./policy";

/**
 * INSTANT_READ answers for the questions people ask most, straight from the database: no model call, no task, no
 * approval. Every answer is a real count or list, checked against the asker's own permissions. Questions that match
 * nothing here are answered by the AI employee in read-only mode instead.
 */

const DAY = 86400_000;
type Say = Record<ReplyLanguage, string>;
interface InstantLine {
  say: Say;
  href?: string;
}
interface InstantResult {
  lines: InstantLine[];
  records?: string[];
}
interface Metric {
  id: string;
  match: RegExp;
  permission: Permission | null;
  run: (user: SessionUser, text: string, now: Date) => Promise<InstantResult>;
}

const say = (en: string, hinglish: string, hi: string): Say => ({ en, hinglish, hi });
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const money = (a: { currency: string; amount: { toString(): string } }[]) => fmtMulti(a.map((x) => ({ currency: x.currency, amount: x.amount.toString() })));
const startOfDay = (now: Date) => new Date(now.getFullYear(), now.getMonth(), now.getDate());
const OPEN_TICKET = ["OPEN", "IN_PROGRESS", "WAITING_FOR_CLIENT"] as const;
const OPEN_TASK = ["TODO", "IN_PROGRESS", "REVIEW", "BLOCKED"] as const;
const LIST = /\b(show|list|display|which|dikhao|dikha do|konse|kaunse)\b|दिखाओ|कौन/i;

const METRICS: Metric[] = [
  {
    id: "leads_today",
    match: /((today'?s?|aaj( ki| ke| ka)?|आज( की| के)?)\s+(new\s+)?(leads?|लीड))|((leads?|लीड).*\b(today|aaj)\b)|(लीड.*आज)/i,
    permission: "leads:view",
    run: async (_u, text, now) => {
      const where = { archivedAt: null, createdAt: { gte: startOfDay(now) } };
      const [n, rows] = await Promise.all([db.lead.count({ where }), db.lead.findMany({ where, orderBy: { createdAt: "desc" }, take: 10, select: { id: true, ref: true, name: true, company: true, status: true } })]);
      const lines: InstantLine[] = [{ say: say(`${plural(n, "new lead")} came in today.`, `Aaj ${plural(n, "naya lead", "naye leads")} aaye hain.`, `आज ${n} नए लीड आए हैं।`), href: "/admin/leads" }];
      if (n && LIST.test(text)) for (const l of rows) lines.push({ say: say(`${l.ref} · ${l.name}${l.company ? `, ${l.company}` : ""} (${l.status.toLowerCase()})`, `${l.ref} · ${l.name}${l.company ? `, ${l.company}` : ""} (${l.status.toLowerCase()})`, `${l.ref} · ${l.name}${l.company ? `, ${l.company}` : ""}`), href: `/admin/leads/${l.id}` });
      return { lines, records: rows.map((l) => `Lead:${l.id}`) };
    },
  },
  {
    id: "my_leads",
    match: /\b(my|mere|meri|mera)\b.*\b(leads?)\b|मेरे लीड/i,
    permission: "leads:view",
    run: async (u, text) => {
      const where = { archivedAt: null, assignedToId: u.id, status: { notIn: ["WON" as const, "LOST" as const] } };
      const [n, rows] = await Promise.all([db.lead.count({ where }), db.lead.findMany({ where, orderBy: { createdAt: "desc" }, take: 10, select: { id: true, ref: true, name: true, company: true, status: true } })]);
      const lines: InstantLine[] = [{ say: say(`You have ${plural(n, "open lead")} assigned to you.`, `Aapke paas ${n} open leads assigned hain.`, `आपको ${n} खुले लीड सौंपे गए हैं।`), href: "/admin/leads" }];
      if (n && (LIST.test(text) || n <= 5)) for (const l of rows) { const row = `${l.ref} · ${l.name}${l.company ? `, ${l.company}` : ""} (${l.status.toLowerCase().replace(/_/g, " ")})`; lines.push({ say: say(row, row, row), href: `/admin/leads/${l.id}` }); }
      return { lines, records: rows.map((l) => `Lead:${l.id}`) };
    },
  },
  {
    id: "visitors_online",
    match: /(visitors?|विज़िटर|विजिटर).*(online|live|right now|abhi|currently|अभी|ऑनलाइन)|(online|live|abhi).*(visitors?)|who('s| is) on the (web)?site/i,
    permission: "visitors:view",
    run: async (_u, _t, now) => {
      const policy = await getVisitorPolicy();
      const since = new Date(now.getTime() - policy.liveWindowMinutes * 60_000);
      const n = await db.visitorSession.count({ where: { lastSeenAt: { gte: since }, endedAt: null, visitor: { isBot: false } } });
      const off = policy.enabled === false ? say(" Visitor tracking is switched off, so this may be zero.", " Visitor tracking band hai, isliye yeh zero ho sakta hai.", " विज़िटर ट्रैकिंग बंद है, इसलिए यह शून्य हो सकता है।") : say("", "", "");
      return { lines: [{ say: say(`${plural(n, "visitor")} on the website right now (active in the last ${policy.liveWindowMinutes} minutes).${off.en}`, `Abhi website par ${n} visitor hain (pichhle ${policy.liveWindowMinutes} minute mein active).${off.hinglish}`, `अभी वेबसाइट पर ${n} विज़िटर हैं (पिछले ${policy.liveWindowMinutes} मिनट में सक्रिय)।${off.hi}`), href: "/admin/visitors/live" }] };
    },
  },
  {
    id: "employees_present",
    match: /(employees?|staff|team|people|log|कर्मचारी|स्टाफ).*(present|attendance|in office|checked in|aaye|aaj aaye|हाज़िर|हाजिर|उपस्थित)|\b(present today|attendance today|aaj ki attendance|kitne log aaye)\b|अटेंडेंस|उपस्थित/i,
    permission: "attendance:view",
    run: async () => {
      const rows = await liveWorkforce({});
      const s = summarize(rows);
      const late = rows.filter((r) => r.late > 0).length;
      return {
        lines: [
          { say: say(`${s.present} of ${s.total} employees are present today.`, `Aaj ${s.total} mein se ${s.present} employees present hain.`, `आज ${s.total} में से ${s.present} कर्मचारी उपस्थित हैं।`), href: "/admin/attendance" },
          { say: say(`${s.working} working, ${s.onBreak} on break, ${late} late, ${s.absent} absent, ${s.onLeave} on leave, ${s.notYet} not checked in yet.`, `${s.working} kaam par, ${s.onBreak} break par, ${late} late, ${s.absent} absent, ${s.onLeave} chhutti par, ${s.notYet} ne abhi check-in nahi kiya.`, `${s.working} काम पर, ${s.onBreak} ब्रेक पर, ${late} देर से, ${s.absent} अनुपस्थित, ${s.onLeave} छुट्टी पर, ${s.notYet} ने अभी चेक-इन नहीं किया।`) },
        ],
      };
    },
  },
  {
    id: "my_tasks",
    match: /\b(my|mere|meri|mera)\b.*\b(tasks?|to-?dos?|kaam)\b|मेरे (काम|टास्क)/i,
    permission: null,
    run: async (u, text, now) => {
      const where = { assigneeId: u.id, status: { in: [...OPEN_TASK] } };
      const [n, overdue, rows] = await Promise.all([db.task.count({ where }), db.task.count({ where: { ...where, dueDate: { lt: now } } }), db.task.findMany({ where, orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }], take: 10, select: { id: true, title: true, dueDate: true, projectId: true } })]);
      const lines: InstantLine[] = [{ say: say(`You have ${plural(n, "pending task")}${overdue ? `, ${overdue} overdue` : ""}.`, `Aapke ${n} pending task hain${overdue ? `, ${overdue} overdue` : ""}.`, `आपके ${n} लंबित काम हैं${overdue ? `, ${overdue} समय से पीछे` : ""}।`), href: "/admin/tasks" }];
      if (n && (LIST.test(text) || n <= 5)) for (const t of rows) lines.push({ say: say(`${t.title}${t.dueDate ? ` (due ${t.dueDate.toISOString().slice(0, 10)})` : ""}`, `${t.title}${t.dueDate ? ` (due ${t.dueDate.toISOString().slice(0, 10)})` : ""}`, `${t.title}${t.dueDate ? ` (${t.dueDate.toISOString().slice(0, 10)})` : ""}`), href: `/admin/projects/${t.projectId}` });
      return { lines, records: rows.map((t) => `Task:${t.id}`) };
    },
  },
  {
    id: "tasks_overdue",
    match: /(overdue|late|pending|due|delayed|baaki|बाकी|लंबित).*\b(tasks?|to-?dos?)\b|\b(tasks?)\b.*(overdue|late|pending|due|delayed|baaki)|टास्क/i,
    permission: "projects:view",
    run: async (_u, _t, now) => {
      const [overdue, open] = await Promise.all([db.task.count({ where: { status: { in: [...OPEN_TASK] }, dueDate: { lt: now } } }), db.task.count({ where: { status: { in: [...OPEN_TASK] } } })]);
      return { lines: [{ say: say(`${plural(overdue, "task")} ${overdue === 1 ? "is" : "are"} overdue, out of ${open} open tasks.`, `${open} open tasks mein se ${overdue} overdue hain.`, `${open} खुले कामों में से ${overdue} समय से पीछे हैं।`), href: "/admin/tasks" }] };
    },
  },
  {
    id: "invoices_unpaid",
    match: /(unpaid|outstanding|overdue|pending|due|baaki|bakaya|बकाया|बाकी|paid nahi).*(invoices?|इनवॉइस|bill)|(invoices?|इनवॉइस|bills?).*(unpaid|outstanding|overdue|pending|due|baaki|bakaya|paid nahi|बकाया)|\binvoices?\b/i,
    permission: "finance:view",
    run: async (_u, _t, now) => {
      const f = await financeSummary({ to: now });
      return {
        lines: [
          { say: say(`${plural(f.outstandingCount, "invoice")} unpaid, ${money(f.outstanding)} outstanding.`, `${f.outstandingCount} invoice unpaid hain, ${money(f.outstanding)} baaki hai.`, `${f.outstandingCount} इनवॉइस बकाया हैं, कुल ${money(f.outstanding)}।`), href: "/admin/finance/invoices" },
          { say: say(`${f.overdueCount} of them ${f.overdueCount === 1 ? "is" : "are"} overdue (${money(f.overdue)}).`, `Inmein se ${f.overdueCount} overdue hain (${money(f.overdue)}).`, `इनमें से ${f.overdueCount} की तारीख निकल चुकी है (${money(f.overdue)})।`), href: "/admin/finance/invoices?status=OVERDUE" },
        ],
      };
    },
  },
  {
    id: "revenue",
    match: /\b(revenue|income|earnings|kamai|collection|collected|turnover)\b|रेवेन्यू|कमाई|आमदनी/i,
    permission: "finance:view",
    run: async (_u, _t, now) => {
      const month = new Date(now.getFullYear(), now.getMonth(), 1);
      const [m, d30] = await Promise.all([financeSummary({ from: month, to: now }), financeSummary({ from: new Date(now.getTime() - 30 * DAY), to: now })]);
      return {
        lines: [
          { say: say(`Revenue collected this month: ${money(m.collected)}.`, `Is mahine ${money(m.collected)} revenue collect hua hai.`, `इस महीने ${money(m.collected)} का रेवेन्यू आया है।`), href: "/admin/finance" },
          { say: say(`Last 30 days: ${money(d30.collected)} from ${plural(d30.collectedCount, "payment")}. Outstanding: ${money(d30.outstanding)}.`, `Pichhle 30 din: ${money(d30.collected)} (${d30.collectedCount} payments). Baaki: ${money(d30.outstanding)}.`, `पिछले 30 दिन: ${money(d30.collected)} (${d30.collectedCount} भुगतान)। बकाया: ${money(d30.outstanding)}।`) },
        ],
      };
    },
  },
  {
    id: "proposals_pending",
    match: /\b(proposals?|quotations?)\b|प्रपोज़ल|प्रस्ताव/i,
    permission: "proposals:view",
    run: async () => {
      const g = await db.proposal.groupBy({ by: ["status"], where: { deletedAt: null, status: { in: ["DRAFT", "INTERNAL_REVIEW", "SENT", "VIEWED"] } }, _count: true });
      const c = (s: string) => g.find((x) => x.status === s)?._count ?? 0;
      const total = g.reduce((n, x) => n + x._count, 0);
      return { lines: [{ say: say(`${plural(total, "proposal")} pending: ${c("DRAFT")} draft, ${c("INTERNAL_REVIEW")} in internal review, ${c("SENT") + c("VIEWED")} sent and awaiting the client (${c("VIEWED")} viewed).`, `${total} proposals pending hain: ${c("DRAFT")} draft, ${c("INTERNAL_REVIEW")} internal review mein, ${c("SENT") + c("VIEWED")} client ke paas (${c("VIEWED")} ne dekha).`, `${total} प्रपोज़ल लंबित हैं: ${c("DRAFT")} ड्राफ्ट, ${c("INTERNAL_REVIEW")} आंतरिक समीक्षा में, ${c("SENT") + c("VIEWED")} क्लाइंट के पास।`), href: "/admin/proposals" }] };
    },
  },
  {
    id: "tickets_open",
    match: /\b(tickets?|support|complaints?|helpdesk)\b|टिकट|शिकायत/i,
    permission: "support:view",
    run: async (_u, _t, now) => {
      const open = { status: { in: [...OPEN_TICKET] } };
      const [n, urgent, pastDue] = await Promise.all([db.ticket.count({ where: open }), db.ticket.count({ where: { ...open, priority: "URGENT" } }), db.ticket.count({ where: { ...open, resolutionDueAt: { lt: now } } })]);
      return { lines: [{ say: say(`${plural(n, "support ticket")} open: ${urgent} urgent, ${pastDue} past resolution due.`, `${n} support tickets open hain: ${urgent} urgent, ${pastDue} resolution due date cross kar chuke.`, `${n} सपोर्ट टिकट खुले हैं: ${urgent} अत्यावश्यक, ${pastDue} समय-सीमा पार।`), href: "/admin/support" }] };
    },
  },
  {
    id: "approvals_pending",
    match: /\b(approvals?|approve karne)\b|मंज़ूरी|अप्रूवल/i,
    permission: "ai:approve",
    run: async () => {
      const n = await db.aIApproval.count({ where: { status: "PENDING" } });
      return { lines: [{ say: say(`${plural(n, "AI action")} ${n === 1 ? "is" : "are"} waiting for your approval.`, `${n} AI actions aapke approval ka intezaar kar rahe hain.`, `${n} AI कार्य आपकी मंज़ूरी की प्रतीक्षा में हैं।`), href: "/admin/ai/approvals" }] };
    },
  },
  {
    id: "deals_active",
    match: /\b(deals?|pipeline|opportunit(y|ies))\b|डील|पाइपलाइन/i,
    permission: "deals:view",
    run: async () => {
      const m = await dealMetrics({});
      return { lines: [{ say: say(`${plural(m.openCount, "active deal")} in the pipeline, worth ${money(m.pipeline)} (weighted ${money(m.weighted)}).`, `Pipeline mein ${m.openCount} active deals hain, value ${money(m.pipeline)} (weighted ${money(m.weighted)}).`, `पाइपलाइन में ${m.openCount} सक्रिय डील हैं, मूल्य ${money(m.pipeline)}।`), href: "/admin/deals" }] };
    },
  },
  {
    id: "projects_active",
    match: /\b(projects?)\b|प्रोजेक्ट|परियोजना/i,
    permission: "projects:view",
    run: async () => {
      const [active, red, onHold] = await Promise.all([db.project.count({ where: { deletedAt: null, status: "ACTIVE" } }), db.project.count({ where: { deletedAt: null, status: { in: ["ACTIVE", "PLANNED"] }, health: "RED" } }), db.project.count({ where: { deletedAt: null, status: "ON_HOLD" } })]);
      return { lines: [{ say: say(`${plural(active, "active project")}; ${red} at risk, ${onHold} on hold.`, `${active} active projects hain; ${red} risk mein, ${onHold} hold par.`, `${active} सक्रिय प्रोजेक्ट हैं; ${red} जोखिम में, ${onHold} रुके हुए।`), href: "/admin/projects" }] };
    },
  },
  {
    id: "leads_total",
    match: /\b(leads?)\b|लीड/i,
    permission: "leads:view",
    run: async (_u, _t, now) => {
      const base = { archivedAt: null };
      const [total, week, fresh] = await Promise.all([db.lead.count({ where: base }), db.lead.count({ where: { ...base, createdAt: { gte: new Date(now.getTime() - 7 * DAY) } } }), db.lead.count({ where: { ...base, status: "NEW" } })]);
      return { lines: [{ say: say(`You have ${plural(total, "lead")} in total. ${week} came in during the last 7 days, and ${fresh} ${fresh === 1 ? "is" : "are"} still new (not contacted).`, `Total ${total} leads hain. Pichhle 7 din mein ${week} aaye, aur ${fresh} abhi bhi new hain (contact nahi hue).`, `कुल ${total} लीड हैं। पिछले 7 दिनों में ${week} आए, और ${fresh} से अभी संपर्क नहीं हुआ।`), href: "/admin/leads" }] };
    },
  },
];

/* "What's the status of Acme?" / "Acme ka status kya hai?" — a name lookup across the records the asker can see. */
const LOOKUP = /\bstatus of\s+(.+?)[?.!]*$|^\s*(.+?)\s+ka status\b|^\s*how is\s+(.+?)\s+doing\b|(.+?)\s+का स्टेटस/i;

async function lookup(user: SessionUser, term: string): Promise<InstantResult | null> {
  const q = term.replace(/^(the|our)\s+/i, "").replace(/\b(client|account|deal|lead|project|company)\b/gi, "").trim();
  if (q.length < 2 || q.length > 80) return null;
  const has = { contains: q, mode: "insensitive" as const };
  const [clients, leads, deals, projects] = await Promise.all([
    can(user.role, "clients:view") ? db.client.findMany({ where: { deletedAt: null, name: has }, take: 3, select: { id: true, number: true, name: true, status: true } }) : [],
    can(user.role, "leads:view") ? db.lead.findMany({ where: { archivedAt: null, OR: [{ name: has }, { company: has }] }, take: 3, orderBy: { createdAt: "desc" }, select: { id: true, ref: true, name: true, company: true, status: true } }) : [],
    can(user.role, "deals:view") ? db.deal.findMany({ where: { deletedAt: null, OR: [{ name: has }, { company: has }] }, take: 3, orderBy: { createdAt: "desc" }, select: { id: true, number: true, name: true, stage: true, value: true, currency: true } }) : [],
    can(user.role, "projects:view") ? db.project.findMany({ where: { deletedAt: null, name: has }, take: 3, select: { id: true, number: true, name: true, status: true, health: true } }) : [],
  ]);
  const lines: InstantLine[] = [];
  const same = (s: string) => say(s, s, s);
  for (const c of clients) lines.push({ say: same(`Client ${c.number} ${c.name}: ${c.status.toLowerCase().replace(/_/g, " ")}`), href: `/admin/clients/${c.id}` });
  for (const d of deals) lines.push({ say: same(`Deal ${d.number} ${d.name}: ${d.stage.toLowerCase()} stage, ${money([{ currency: d.currency, amount: d.value }])}`), href: `/admin/deals/${d.id}` });
  for (const p of projects) lines.push({ say: same(`Project ${p.number} ${p.name}: ${p.status.toLowerCase().replace(/_/g, " ")}, health ${p.health.toLowerCase()}`), href: `/admin/projects/${p.id}` });
  for (const l of leads) lines.push({ say: same(`Lead ${l.ref} ${l.name}${l.company ? ` (${l.company})` : ""}: ${l.status.toLowerCase().replace(/_/g, " ")}`), href: `/admin/leads/${l.id}` });
  if (!lines.length) return null;
  return { lines, records: [...clients.map((c) => `Client:${c.id}`), ...deals.map((d) => `Deal:${d.id}`), ...projects.map((p) => `Project:${p.id}`), ...leads.map((l) => `Lead:${l.id}`)] };
}

export interface InstantAnswer {
  metrics: string[];
  text: string;
  spoken: string;
  records: string[];
}

const NO_ACCESS: Say = say("You don't have access to that information.", "Aapke paas is jaankari ka access nahi hai.", "आपके पास इस जानकारी की पहुँच नहीं है।");

/**
 * Answers the question from live data when it matches known metrics (at most three per question); null when it does
 * not, so the caller falls back to the AI employee in read-only mode.
 */
export async function instantAnswer(user: SessionUser, text: string, language: ReplyLanguage, now = new Date()): Promise<InstantAnswer | null> {
  const found = LOOKUP.exec(text);
  if (found) {
    const r = await lookup(user, (found[1] ?? found[2] ?? found[3] ?? found[4] ?? "").trim());
    if (r) return render(["lookup"], [r], language);
  }
  const hits: Metric[] = [];
  for (const m of METRICS) {
    if (!m.match.test(text)) continue;
    // "today's leads" already answers "leads"; "my tasks" already answers "tasks".
    if (m.id === "leads_total" && hits.some((h) => h.id === "leads_today" || h.id === "my_leads")) continue;
    if (m.id === "tasks_overdue" && hits.some((h) => h.id === "my_tasks")) continue;
    if (m.id === "invoices_unpaid" && hits.some((h) => h.id === "revenue") && !/unpaid|outstanding|overdue|pending|baaki|bakaya/i.test(text)) continue;
    hits.push(m);
    if (hits.length === 3) break;
  }
  if (!hits.length) return null;
  const results: InstantResult[] = [];
  for (const m of hits) results.push(m.permission && !can(user.role, m.permission) ? { lines: [{ say: NO_ACCESS }] } : await m.run(user, text, now));
  return render(hits.map((m) => m.id), results, language);
}

function render(metrics: string[], results: InstantResult[], language: ReplyLanguage): InstantAnswer {
  const lines = results.flatMap((r) => r.lines);
  const text = lines.map((l, i) => (i === 0 || !l.href || lines.length <= 2 ? `${l.say[language]}${l.href ? ` [Open](${l.href})` : ""}` : `- [${l.say[language]}](${l.href})`)).join("\n\n");
  // Spoken form: headline sentences only (no list rows, no links).
  const spoken = results.map((r) => r.lines.filter((l, i) => i === 0 || !l.href).slice(0, 2).map((l) => l.say[language]).join(" ")).join(" ");
  return { metrics, text, spoken, records: results.flatMap((r) => r.records ?? []) };
}
