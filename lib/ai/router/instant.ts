import "server-only";
import { can } from "@/lib/auth/permissions";
import type { SessionUser } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { fmtMulti } from "@/lib/os/money";
import { AGENTS } from "../catalog";
import { canRunAgent, getAgentConfig } from "../agents";
import { getTool, toolPermissions } from "../tools";
import type { ReplyLanguage } from "./policy";

/**
 * INSTANT_READ answers for the questions people ask most. Each one calls an existing controlled read tool (the same
 * tools the AI employees use), so it gets the same checks: the tool must be enabled for that AI employee AND the
 * person must hold its permissions. No model call, no AI task, no approval; the numbers are real database counts.
 * Questions that match nothing here are answered by the AI employee itself in read-only mode.
 */

type Say = Record<ReplyLanguage, string>;
type Data = Record<string, unknown>;
interface Line {
  say: Say;
  href?: string;
}
export interface Call {
  tool: string;
  input: Data;
}
interface Metric {
  id: string;
  match: RegExp;
  /** What "couldn't retrieve …" names when the database cannot be read. */
  area: Say;
  calls: (text: string) => Call[];
  render: (out: Data[], text: string) => Line[];
}

const say = (en: string, hinglish: string, hi: string): Say => ({ en, hinglish, hi });
const same = (s: string): Say => say(s, s, s);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const num = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0));
const money = (a: unknown) => (Array.isArray(a) && a.length ? fmtMulti(a.map((x: { currency: string; amount: { toString(): string } }) => ({ currency: x.currency, amount: x.amount.toString() }))) : fmtMulti([]));
const LIST = /\b(show|list|display|which|dikhao|dikha do|konse|kaunse)\b|दिखाओ|कौन/i;
const TODAY = /\b(today|aaj)\b|आज/i;
const rows = (list: unknown): Line[] =>
  (Array.isArray(list) ? (list as Data[]) : []).map((r) => ({
    say: same([r.ref ?? r.number, r.name ?? r.title].filter(Boolean).join(" · ") + (r.company ? `, ${r.company}` : "") + (r.status ? ` (${String(r.status).toLowerCase().replace(/_/g, " ")})` : r.stage ? ` (${String(r.stage).toLowerCase()})` : "") + (r.dueDate ? ` · due ${r.dueDate}` : "")),
    href: r.link ? String(r.link) : undefined,
  }));

const LEADS: Say = say("lead count", "leads ki ginti", "लीड की संख्या");

/** "qualified / sales-ready / nurture / low-fit / unscored leads" → the growth qualification tier on the lead. */
const TIER_WORDS: [RegExp, string, Say][] = [
  [/sales[- ]?ready|ready (for|to) (sales|buy)|सेल्स[- ]?रेडी/i, "sales_ready", say("sales-ready", "sales-ready", "सेल्स-रेडी")],
  [/low[- ]?fit|poor[- ]?fit|not a fit|लो[- ]?फिट/i, "low_fit", say("low-fit", "low-fit", "लो-फिट")],
  [/\bnurtur(e|ing)\b/i, "nurture", say("nurture", "nurture", "नर्चर")],
  [/\b(unscored|not (yet )?scored|not (yet )?qualified)\b/i, "unscored", say("unscored", "unscored", "बिना स्कोर")],
  [/\bqualified\b|क्वालिफाइड/i, "qualified", say("qualified", "qualified", "क्वालिफाइड")],
];
const tierOf = (t: string) => TIER_WORDS.find(([re]) => re.test(t));

const METRICS: Metric[] = [
  {
    id: "leads_tier",
    match: /(sales[- ]?ready|low[- ]?fit|poor[- ]?fit|nurtur(e|ing)|unscored|not (yet )?scored|(not (yet )?)?qualified|सेल्स[- ]?रेडी|क्वालिफाइड|लो[- ]?फिट)[^?.!]*\b(leads?|prospects? in (the )?crm)\b|\bleads?\b[^?.!]*(sales[- ]?ready|low[- ]?fit|nurtur(e|ing)|unscored|qualified)|(क्वालिफाइड|सेल्स[- ]?रेडी).*लीड/i,
    area: LEADS,
    calls: (t) => [{ tool: "countLeads", input: { tier: tierOf(t)?.[1] ?? "qualified", period: TODAY.test(t) ? "today" : "all", list: LIST.test(t) } }],
    render: ([o], t) => {
      const n = num(o.count);
      const w = tierOf(t)?.[2] ?? say("qualified", "qualified", "क्वालिफाइड");
      const when = TODAY.test(t);
      const note = tierOf(t)?.[1] === "qualified" ? say(" (growth tier Qualified or Sales-ready)", " (growth tier Qualified ya Sales-ready)", " (ग्रोथ टियर Qualified या Sales-ready)") : say("", "", "");
      return [{ say: say(`${plural(n, `${w.en} lead`)}${when ? " created today" : ""}${note.en}.`, `${when ? "Aaj ke " : ""}${n} ${w.hinglish} leads hain${note.hinglish}.`, `${when ? "आज के " : ""}${n} ${w.hi} लीड हैं${note.hi}।`), href: "/admin/marketing/growth" }, ...rows(o.leads)];
    },
  },
  {
    id: "website_leads",
    match: /\b(website|site|web form|online form)\b.*\bleads?\b|\bleads?\b.*\b(website|site|web form)\b|वेबसाइट.*लीड/i,
    area: LEADS,
    calls: (t) => [{ tool: "countLeads", input: { source: "website", period: TODAY.test(t) ? "today" : "all", list: LIST.test(t) } }],
    render: ([o], t) => {
      const when = TODAY.test(t);
      const n = num(o.count);
      return [{ say: say(`${plural(n, "lead")} came from the website${when ? " today" : ""}.`, `${when ? "Aaj " : ""}website se ${n} leads aaye hain.`, `${when ? "आज " : ""}वेबसाइट से ${n} लीड आए हैं।`), href: "/admin/leads" }, ...rows(o.leads)];
    },
  },
  {
    id: "hot_leads",
    match: /\bhot\b.*\bleads?\b|\bleads?\b.*\bhot\b|हॉट लीड/i,
    area: LEADS,
    calls: (t) => [{ tool: "countLeads", input: { hot: true, openOnly: true, list: LIST.test(t) } }],
    render: ([o]) => {
      const n = num(o.count);
      return [{ say: say(`${plural(n, "hot lead")} open right now (scored Hot or marked high priority).`, `Abhi ${n} hot leads open hain (Hot score ya high priority).`, `अभी ${n} हॉट लीड खुले हैं।`), href: "/admin/leads" }, ...rows(o.leads)];
    },
  },
  {
    id: "leads_today",
    match: /((today'?s?|aaj( ki| ke| ka)?|आज( की| के)?)\s+(new\s+)?(leads?|लीड))|((leads?|लीड).*\b(today|aaj)\b)|(लीड.*आज)/i,
    area: LEADS,
    calls: (t) => [{ tool: "countLeads", input: { period: "today", list: LIST.test(t) } }],
    render: ([o]) => {
      const n = num(o.count);
      return [{ say: say(`${plural(n, "new lead")} came in today.`, `Aaj ${n} naye leads aaye hain.`, `आज ${n} नए लीड आए हैं।`), href: "/admin/leads" }, ...rows(o.leads)];
    },
  },
  {
    id: "my_leads",
    match: /\b(my|mere|meri|mera)\b.*\bleads?\b|मेरे लीड/i,
    area: LEADS,
    calls: () => [{ tool: "countLeads", input: { assignedToMe: true, openOnly: true, list: true } }],
    render: ([o], t) => {
      const n = num(o.count);
      return [{ say: say(`You have ${plural(n, "open lead")} assigned to you.`, `Aapke paas ${n} open leads assigned hain.`, `आपको ${n} खुले लीड सौंपे गए हैं।`), href: "/admin/leads" }, ...(LIST.test(t) || n <= 5 ? rows(o.leads) : [])];
    },
  },
  {
    id: "leads_country",
    match: /\bleads?\b.*\b(from|in)\s+(the\s+)?(US|USA|UK|UAE|India|[A-Z][a-z]{2,}(?: [A-Z][a-z]+)?)\b|\b(US|USA|UK|UAE|India|[A-Z][a-z]{2,})\s+se\b.*\bleads?\b/,
    area: LEADS,
    calls: (t) => [{ tool: "countLeads", input: { country: countryIn(t) ?? "", list: LIST.test(t) } }],
    render: ([o], t) => {
      const n = num(o.count);
      const c = countryIn(t) ?? "";
      return [{ say: say(`${plural(n, "lead")} from ${c}.`, `${n} leads ${c} se hain.`, `${c} से ${n} लीड हैं।`), href: "/admin/leads" }, ...rows(o.leads)];
    },
  },
  {
    id: "visitors_online",
    match: /(visitors?|विज़िटर|विजिटर).*(online|live|right now|abhi|currently|अभी|ऑनलाइन)|(online|live|abhi).*(visitors?)|who('s| is) on the (web)?site/i,
    area: say("visitor count", "visitors ki ginti", "विज़िटर की संख्या"),
    calls: () => [{ tool: "countLiveVisitors", input: {} }],
    render: ([o]) => {
      const n = num(o.online);
      const w = num(o.windowMinutes);
      const off = o.trackingEnabled === false;
      return [{ say: say(`${plural(n, "visitor")} on the website right now (active in the last ${w} minutes).${off ? " Visitor tracking is switched off, so this may be zero." : ""}`, `Abhi website par ${n} visitors hain (pichhle ${w} minute mein active).${off ? " Visitor tracking band hai." : ""}`, `अभी वेबसाइट पर ${n} विज़िटर हैं (पिछले ${w} मिनट में सक्रिय)।${off ? " विज़िटर ट्रैकिंग बंद है।" : ""}`), href: "/admin/visitors/live" }];
    },
  },
  {
    id: "employees_present",
    match: /(employees?|staff|team|people|log|कर्मचारी|स्टाफ).*(present|attendance|in office|checked in|aaye|हाज़िर|हाजिर|उपस्थित)|\b(present today|attendance today|aaj ki attendance|kitne log aaye)\b|अटेंडेंस|उपस्थित/i,
    area: say("attendance", "attendance", "उपस्थिति"),
    calls: () => [{ tool: "getWorkforceToday", input: {} }],
    render: ([o]) => {
      const s = (o.summary ?? {}) as Record<string, number>;
      return [
        { say: say(`${s.present ?? 0} of ${s.total ?? 0} employees are present today.`, `Aaj ${s.total ?? 0} mein se ${s.present ?? 0} employees present hain.`, `आज ${s.total ?? 0} में से ${s.present ?? 0} कर्मचारी उपस्थित हैं।`), href: "/admin/attendance" },
        { say: say(`${s.working ?? 0} working, ${s.onBreak ?? 0} on break, ${s.absent ?? 0} absent, ${s.onLeave ?? 0} on leave, ${s.notYet ?? 0} not checked in yet.`, `${s.working ?? 0} kaam par, ${s.onBreak ?? 0} break par, ${s.absent ?? 0} absent, ${s.onLeave ?? 0} chhutti par, ${s.notYet ?? 0} ne abhi check-in nahi kiya.`, `${s.working ?? 0} काम पर, ${s.onBreak ?? 0} ब्रेक पर, ${s.absent ?? 0} अनुपस्थित, ${s.onLeave ?? 0} छुट्टी पर, ${s.notYet ?? 0} ने अभी चेक-इन नहीं किया।`) },
      ];
    },
  },
  {
    id: "my_tasks",
    match: /\b(my|mere|meri|mera)\b.*\b(tasks?|to-?dos?|kaam)\b|मेरे (काम|टास्क)/i,
    area: say("tasks", "tasks", "काम"),
    calls: () => [{ tool: "countTasks", input: { mine: true, list: true } }],
    render: ([o]) => {
      const n = num(o.open);
      const late = num(o.overdue);
      return [{ say: say(`You have ${plural(n, "pending task")}${late ? `, ${late} overdue` : ""}.`, `Aapke ${n} pending tasks hain${late ? `, ${late} overdue` : ""}.`, `आपके ${n} लंबित काम हैं${late ? `, ${late} समय से पीछे` : ""}।`), href: "/admin/tasks" }, ...rows(o.tasks)];
    },
  },
  {
    id: "tasks_overdue",
    match: /(overdue|late|pending|due|delayed|baaki|बाकी|लंबित).*\b(tasks?|to-?dos?)\b|\b(tasks?)\b.*(overdue|late|pending|due|delayed|baaki)|टास्क/i,
    area: say("tasks", "tasks", "काम"),
    calls: () => [{ tool: "countTasks", input: {} }],
    render: ([o]) => [{ say: say(`${plural(num(o.overdue), "task")} overdue, out of ${num(o.open)} open tasks.`, `${num(o.open)} open tasks mein se ${num(o.overdue)} overdue hain.`, `${num(o.open)} खुले कामों में से ${num(o.overdue)} समय से पीछे हैं।`), href: "/admin/tasks" }],
  },
  {
    id: "invoices_unpaid",
    match: /(unpaid|outstanding|overdue|pending|due|baaki|bakaya|बकाया|बाकी|paid nahi).*(invoices?|इनवॉइस|bills?)|(invoices?|इनवॉइस|bills?).*(unpaid|outstanding|overdue|pending|due|baaki|bakaya|paid nahi|बकाया)|\binvoices?\b/i,
    area: say("invoice figures", "invoice ki jaankari", "इनवॉइस की जानकारी"),
    calls: () => [{ tool: "getFinanceSummary", input: { days: 30 } }],
    render: ([o]) => [
      { say: say(`${plural(num(o.outstandingCount), "invoice")} unpaid, ${money(o.outstanding)} outstanding.`, `${num(o.outstandingCount)} invoices unpaid hain, ${money(o.outstanding)} baaki hai.`, `${num(o.outstandingCount)} इनवॉइस बकाया हैं, कुल ${money(o.outstanding)}।`), href: "/admin/finance/invoices" },
      { say: say(`${num(o.overdueCount)} of them overdue (${money(o.overdue)}).`, `Inmein se ${num(o.overdueCount)} overdue hain (${money(o.overdue)}).`, `इनमें से ${num(o.overdueCount)} की तारीख निकल चुकी है (${money(o.overdue)})।`) },
    ],
  },
  {
    id: "revenue",
    match: /\b(revenue|income|earnings|kamai|collection|collected|turnover)\b|रेवेन्यू|कमाई|आमदनी/i,
    area: say("revenue", "revenue", "रेवेन्यू"),
    calls: () => [{ tool: "getFinanceSummary", input: { days: 30 } }],
    render: ([o]) => [{ say: say(`Revenue collected in the last 30 days: ${money(o.collected)} from ${plural(num(o.collectedCount), "payment")}. Outstanding: ${money(o.outstanding)}.`, `Pichhle 30 din mein ${money(o.collected)} revenue aaya (${num(o.collectedCount)} payments). Baaki: ${money(o.outstanding)}.`, `पिछले 30 दिनों में ${money(o.collected)} का रेवेन्यू आया (${num(o.collectedCount)} भुगतान)। बकाया: ${money(o.outstanding)}।`), href: "/admin/finance" }],
  },
  {
    id: "proposals_pending",
    match: /\b(proposals?|quotations?)\b|प्रपोज़ल|प्रस्ताव/i,
    area: say("proposal count", "proposals ki ginti", "प्रपोज़ल की संख्या"),
    calls: () => [{ tool: "countProposals", input: {} }],
    render: ([o]) => [{ say: say(`${plural(num(o.pending), "proposal")} pending: ${num(o.draft)} draft, ${num(o.internalReview)} in internal review, ${num(o.sent) + num(o.viewed)} with the client (${num(o.viewed)} viewed).`, `${num(o.pending)} proposals pending hain: ${num(o.draft)} draft, ${num(o.internalReview)} internal review mein, ${num(o.sent) + num(o.viewed)} client ke paas (${num(o.viewed)} ne dekha).`, `${num(o.pending)} प्रपोज़ल लंबित हैं: ${num(o.draft)} ड्राफ्ट, ${num(o.internalReview)} आंतरिक समीक्षा में, ${num(o.sent) + num(o.viewed)} क्लाइंट के पास।`), href: "/admin/proposals" }],
  },
  {
    id: "tickets_open",
    match: /\b(tickets?|support|complaints?|helpdesk)\b|टिकट|शिकायत/i,
    area: say("ticket count", "tickets ki ginti", "टिकट की संख्या"),
    calls: () => [{ tool: "countTickets", input: {} }],
    render: ([o]) => [{ say: say(`${plural(num(o.open), "support ticket")} open: ${num(o.urgent)} urgent, ${num(o.pastResolutionDue)} past resolution due.`, `${num(o.open)} support tickets open hain: ${num(o.urgent)} urgent, ${num(o.pastResolutionDue)} resolution due date cross kar chuke.`, `${num(o.open)} सपोर्ट टिकट खुले हैं: ${num(o.urgent)} अत्यावश्यक, ${num(o.pastResolutionDue)} समय-सीमा पार।`), href: "/admin/support" }],
  },
  {
    id: "approvals_pending",
    match: /\b(approvals?)\b|मंज़ूरी|अप्रूवल/i,
    area: say("approvals", "approvals", "मंज़ूरियाँ"),
    calls: () => [{ tool: "countApprovals", input: {} }],
    render: ([o]) => [{ say: say(`${plural(num(o.pending), "AI action")} waiting for approval.`, `${num(o.pending)} AI actions approval ka intezaar kar rahe hain.`, `${num(o.pending)} AI कार्य मंज़ूरी की प्रतीक्षा में हैं।`), href: "/admin/ai/approvals" }],
  },
  {
    id: "contacts",
    match: /\bcontacts?\b|कॉन्टैक्ट|संपर्क/i,
    area: say("contact count", "contacts ki ginti", "संपर्कों की संख्या"),
    calls: () => [{ tool: "countContacts", input: {} }],
    render: ([o]) => [{ say: say(`${plural(num(o.total), "client contact")} on record (${num(o.primary)} primary).`, `${num(o.total)} client contacts hain (${num(o.primary)} primary).`, `${num(o.total)} क्लाइंट संपर्क हैं (${num(o.primary)} प्राथमिक)।`), href: "/admin/contacts" }],
  },
  {
    id: "clients",
    match: /\b(clients?|customers?|accounts?)\b|क्लाइंट|ग्राहक/i,
    area: say("client count", "clients ki ginti", "क्लाइंट की संख्या"),
    calls: () => [{ tool: "countClients", input: {} }],
    render: ([o]) => {
      const b = (o.byStatus ?? {}) as Record<string, number>;
      return [{ say: say(`${plural(b.ACTIVE ?? 0, "active client")}, ${b.ONBOARDING ?? 0} onboarding (${num(o.total)} in total).`, `${b.ACTIVE ?? 0} active clients hain, ${b.ONBOARDING ?? 0} onboarding mein (total ${num(o.total)}).`, `${b.ACTIVE ?? 0} सक्रिय क्लाइंट, ${b.ONBOARDING ?? 0} ऑनबोर्डिंग में (कुल ${num(o.total)})।`), href: "/admin/clients" }];
    },
  },
  {
    id: "deals_active",
    match: /\b(deals?|pipeline|opportunit(y|ies))\b|डील|पाइपलाइन/i,
    area: say("deal figures", "deals ki jaankari", "डील की जानकारी"),
    calls: () => [{ tool: "getPipelineSummary", input: {} }],
    render: ([o]) => [{ say: say(`${plural(num(o.openCount), "active deal")} in the pipeline, worth ${money(o.pipeline)} (weighted ${money(o.weighted)}).`, `Pipeline mein ${num(o.openCount)} active deals hain, value ${money(o.pipeline)} (weighted ${money(o.weighted)}).`, `पाइपलाइन में ${num(o.openCount)} सक्रिय डील हैं, मूल्य ${money(o.pipeline)}।`), href: "/admin/deals" }],
  },
  {
    id: "projects_active",
    match: /\b(projects?)\b|प्रोजेक्ट|परियोजना/i,
    area: say("project count", "projects ki ginti", "प्रोजेक्ट की संख्या"),
    calls: () => [{ tool: "countProjects", input: {} }],
    render: ([o]) => [{ say: say(`${plural(num(o.active), "active project")}; ${num(o.atRisk)} at risk, ${num(o.onHold)} on hold.`, `${num(o.active)} active projects hain; ${num(o.atRisk)} risk mein, ${num(o.onHold)} hold par.`, `${num(o.active)} सक्रिय प्रोजेक्ट हैं; ${num(o.atRisk)} जोखिम में, ${num(o.onHold)} रुके हुए।`), href: "/admin/projects" }],
  },
  {
    id: "leads_total",
    match: /\bleads?\b|लीड/i,
    area: LEADS,
    calls: () => [{ tool: "countLeads", input: {} }, { tool: "countLeads", input: { period: "7d" } }, { tool: "countLeads", input: { status: "NEW" } }],
    render: ([all, week, fresh]) => {
      const [t, w, f] = [num(all.count), num(week.count), num(fresh.count)];
      return [{ say: say(`You have ${plural(t, "lead")} in total. ${w} came in during the last 7 days, and ${f} ${f === 1 ? "is" : "are"} still new (not contacted).`, `Abhi total ${t} leads hain. Pichhle 7 din mein ${w} aaye, aur ${f} abhi bhi new hain (contact nahi hue).`, `अभी कुल ${t} लीड हैं। पिछले 7 दिनों में ${w} आए, और ${f} से अभी संपर्क नहीं हुआ।`), href: "/admin/leads" }];
    },
  },
];

function countryIn(text: string): string | null {
  const m = text.match(/\b(?:from|in)\s+(?:the\s+)?(US|USA|UK|UAE|India|[A-Z][a-z]{2,}(?: [A-Z][a-z]+)?)\b/) ?? text.match(/\b(US|USA|UK|UAE|India|[A-Z][a-z]{2,}(?: [A-Z][a-z]+)?)\s+se\b/);
  const c = m?.[1];
  return c && !/^(The|This|Last|Website|Site)$/.test(c) ? c : null;
}

/* "What's the status of Acme?" / "Acme ka proposal status kya hai?" — a name lookup through the search tools. */
const LOOKUP = /\bstatus of\s+(?:the\s+)?(.+?)[?.!]*$|^\s*(.+?)\s+ka\s+(?:(proposal|deal|project|lead|client)\s+)?status\b|^\s*how is\s+(.+?)\s+doing\b|(.+?)\s+का\s+(?:\S+\s+)?स्टेटस/i;
const LOOKUP_TOOLS: [string, RegExp][] = [
  ["searchProposals", /proposal|quote|प्रपोज़ल/i],
  ["searchDeals", /deal|डील/i],
  ["searchProjects", /project|प्रोजेक्ट/i],
  ["searchClients", /client|account|क्लाइंट/i],
  ["searchLeads", /lead|लीड/i],
];

export interface InstantAnswer {
  metrics: string[];
  tools: string[];
  text: string;
  spoken: string;
  records: string[];
  /** Kept on the conversation so a follow-up ("how many are from US?", "show them") can build on it. */
  followUp: Call | null;
  /** A tool this employee does not have; the router can hand the question to the employee who does. */
  outOfScope: string | null;
}

interface Env {
  user: SessionUser;
  agentSlug: string;
}

type Outcome = { ok: true; data: Data; records: string[] } | { ok: false; reason: "employee" | "user" | "error"; tool: string };

/** Runs one controlled read tool with the router's checks: the employee has it enabled AND the person holds its permissions. */
async function readTool(env: Env, enabled: Set<string>, call: Call): Promise<Outcome> {
  const tool = getTool(call.tool);
  if (!tool || tool.kind !== "read" || !enabled.has(call.tool)) return { ok: false, reason: "employee", tool: call.tool };
  const parsed = tool.input.safeParse(call.input);
  if (!parsed.success) return { ok: false, reason: "error", tool: call.tool };
  if (!toolPermissions(tool, parsed.data).every((p) => can(env.user.role, p))) {
    await audit({ userId: env.user.id, action: "ai.tool.denied", entity: "AIAgent", entityId: env.agentSlug, metadata: { tool: call.tool, via: "router" } });
    return { ok: false, reason: "user", tool: call.tool };
  }
  try {
    const r = await tool.run({ user: env.user, agentSlug: env.agentSlug, executionId: null }, parsed.data);
    return { ok: true, data: (r.data ?? {}) as Data, records: r.records ?? [] };
  } catch (e) {
    console.error("[ai-router] instant read failed", call.tool, (e as Error)?.message);
    return { ok: false, reason: "error", tool: call.tool };
  }
}

/** Which permitted, enabled AI employee has this tool (to point the person to the right colleague). */
export async function ownerOf(user: SessionUser, tool: string, except: string) {
  for (const spec of AGENTS) {
    if (spec.slug === except || !canRunAgent(user.role, spec) || !spec.tools.includes(tool)) continue;
    const cfg = await getAgentConfig(spec.slug);
    if (cfg?.enabled && cfg.tools.has(tool)) return cfg;
  }
  return null;
}

const NO_ACCESS: Say = say("You don't have access to that information.", "Aapke paas is jaankari ka access nahi hai.", "आपके पास इस जानकारी की पहुँच नहीं है।");
const failed = (area: Say): Say => say(`I couldn't retrieve the ${area.en} right now.`, `Abhi ${area.hinglish} nahi mil payi. Thodi der baad try karein.`, `अभी ${area.hi} नहीं मिल पाई। थोड़ी देर बाद कोशिश करें।`);

async function runMetric(env: Env, enabled: Set<string>, m: Metric, text: string): Promise<{ lines: Line[]; records: string[]; tools: string[]; call: Call | null; missing?: string }> {
  const calls = m.calls(text);
  const outs: Data[] = [];
  const records: string[] = [];
  for (const c of calls) {
    const o = await readTool(env, enabled, c);
    if (!o.ok) {
      if (o.reason === "user") return { lines: [{ say: NO_ACCESS }], records: [], tools: [c.tool], call: null };
      if (o.reason === "error") return { lines: [{ say: failed(m.area) }], records: [], tools: [c.tool], call: null };
      const other = await ownerOf(env.user, c.tool, env.agentSlug);
      const me = (await getAgentConfig(env.agentSlug))?.name.replace(/^AI\s+/, "") ?? env.agentSlug;
      const them = other?.name.replace(/^AI\s+/, "");
      return { missing: c.tool, lines: [{ say: say(`That is outside what the ${me} can see.${them ? ` Ask the ${them}.` : ""}`, `Yeh ${me} ke kaam ke bahar hai.${them ? ` ${them} se poochhiye.` : ""}`, `यह ${me} के दायरे से बाहर है।${them ? ` ${them} से पूछिए।` : ""}`) }], records: [], tools: [c.tool], call: null };
    }
    outs.push(o.data);
    records.push(...o.records);
  }
  return { lines: m.render(outs, text), records, tools: calls.map((c) => c.tool), call: calls[0] ?? null };
}

/** A follow-up to the previous instant answer: "how many are from US?", "show them", "inmein se hot kitne hain?". */
function followUpCall(text: string, prev: Call | null): Call | null {
  if (!prev || prev.tool !== "countLeads") return null;
  if (/\b(leads?|deals?|tickets?|invoices?|projects?|proposals?|clients?|contacts?|tasks?)\b/i.test(text)) return null;
  if (/^\s*(show|list|display|dikhao|dikha do)\b/i.test(text) && text.split(/\s+/).length <= 5) return { tool: "countLeads", input: { ...prev.input, list: true } };
  const country = countryIn(text);
  if (country) return { tool: "countLeads", input: { ...prev.input, country, list: false } };
  if (/\bhot\b/i.test(text)) return { tool: "countLeads", input: { ...prev.input, hot: true, list: false } };
  if (TODAY.test(text)) return { tool: "countLeads", input: { ...prev.input, period: "today", list: false } };
  return null;
}

/**
 * Answers the question from live data through the employee's own controlled read tools (at most three metrics per
 * question); null when nothing matches, so the caller falls back to the AI employee in read-only mode.
 */
export async function instantAnswer(user: SessionUser, agentSlug: string, raw: string, language: ReplyLanguage, previous: Call | null = null): Promise<InstantAnswer | null> {
  // "Sarah, total leads kitni hain?" — the employee's name is not part of the question.
  const text = raw.replace(/^\s*[A-Z][a-z]+,\s+/, "");
  const cfg = await getAgentConfig(agentSlug);
  if (!cfg || !cfg.enabled) return null;
  const enabled = new Set(cfg.tools.keys());
  const env: Env = { user, agentSlug };

  const follow = followUpCall(text, previous);
  if (follow) {
    const out = await readTool(env, enabled, follow);
    if (out.ok) {
      const n = num(out.data.count);
      const f = follow.input as { country?: string; hot?: boolean; period?: string; list?: boolean };
      const what = [f.hot ? "hot" : "", f.period === "today" ? "new today" : ""].filter(Boolean).join(", ");
      const head: Say = f.country ? say(`${plural(n, "lead")} from ${f.country}.`, `${n} leads ${f.country} se hain.`, `${f.country} से ${n} लीड हैं।`) : say(`${plural(n, "lead")}${what ? ` (${what})` : ""}.`, `${n} leads${what ? ` (${what})` : ""}.`, `${n} लीड${what ? ` (${what})` : ""}।`);
      const lines: Line[] = f.list ? rows(out.data.leads) : [{ say: head, href: "/admin/leads" }];
      if (f.list && !lines.length) lines.push({ say: say("No leads match.", "Koi lead match nahi hua.", "कोई लीड मेल नहीं खाता।") });
      if (f.list && n > lines.length) lines.push({ say: say(`Showing ${lines.length} of ${n}.`, `${n} mein se ${lines.length} dikha rahe hain.`, `${n} में से ${lines.length} दिखाए गए।`), href: "/admin/leads" });
      return { ...render(["lead_followup"], [lines], language), tools: [follow.tool], records: out.records, followUp: follow, outOfScope: null };
    }
  }

  const found = LOOKUP.exec(text);
  if (found) {
    const term = (found[1] ?? found[2] ?? found[4] ?? found[5] ?? "").replace(/\b(client|account|deal|lead|project|company|proposal)\b/gi, "").replace(/^(the|our)\s+/i, "").trim();
    if (term.length >= 2 && term.length <= 80) {
      const kind = found[3] ?? text;
      const wanted = LOOKUP_TOOLS.filter(([, re]) => re.test(kind)).map(([t]) => t);
      const order = wanted.length ? wanted : LOOKUP_TOOLS.map(([t]) => t);
      const lines: Line[] = [];
      const records: string[] = [];
      const used: string[] = [];
      for (const t of order) {
        if (!enabled.has(t)) continue;
        const o = await readTool(env, enabled, { tool: t, input: { q: term, limit: 3 } });
        if (!o.ok) continue;
        used.push(t);
        lines.push(...rows(o.data));
        records.push(...o.records);
      }
      if (lines.length) return { ...render(["lookup"], [lines], language), tools: used, records, followUp: null, outOfScope: null };
    }
  }

  const hits: Metric[] = [];
  for (const m of METRICS) {
    if (!m.match.test(text)) continue;
    // A more specific answer about the same records already covers the general one.
    if (m.id === "leads_total" && hits.some((h) => h.id.includes("leads"))) continue;
    if (m.id === "leads_today" && hits.some((h) => h.id === "website_leads")) continue;
    if (m.id === "tasks_overdue" && hits.some((h) => h.id === "my_tasks")) continue;
    if (m.id === "clients" && hits.some((h) => h.id === "contacts")) continue;
    if (m.id === "leads_country" && !countryIn(text)) continue;
    if (m.id === "invoices_unpaid" && hits.some((h) => h.id === "revenue") && !/unpaid|outstanding|overdue|pending|baaki|bakaya/i.test(text)) continue;
    hits.push(m);
    if (hits.length === 3) break;
  }
  if (!hits.length) return null;
  const results = [];
  for (const m of hits) results.push(await runMetric(env, enabled, m, text));
  return { ...render(hits.map((m) => m.id), results.map((r) => r.lines), language), tools: results.flatMap((r) => r.tools), records: results.flatMap((r) => r.records), followUp: hits.length === 1 ? results[0].call : null, outOfScope: results.find((r) => r.missing)?.missing ?? null };
}

function render(metrics: string[], groups: Line[][], language: ReplyLanguage) {
  const lines = groups.flat();
  const text = lines.map((l, i) => (i === 0 || lines.length <= 2 || !l.href ? `${l.say[language]}${l.href ? ` [Open](${l.href})` : ""}` : `- [${l.say[language]}](${l.href})`)).join("\n\n");
  // Spoken form: the headline sentences only (no list rows, no links).
  const spoken = groups.map((g) => g.filter((l, i) => i === 0 || !l.href).slice(0, 2).map((l) => l.say[language]).join(" ")).join(" ");
  return { metrics, text, spoken };
}
