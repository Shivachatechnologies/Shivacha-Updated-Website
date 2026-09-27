/**
 * Global AI execution policy: the ONE classification layer every AI request passes through before anything runs,
 * whichever AI employee (catalogue, voice or future custom agent) receives it and whichever channel it came from.
 * It is agent-agnostic on purpose: there is no per-agent routing logic here or anywhere else.
 *
 * Pure (no database, no model call) so it is instant, deterministic, costs nothing and works without an AI provider.
 * English, Hindi (Devanagari) and Hinglish phrasing are recognised.
 */

export const EXECUTION_CLASSES = ["INSTANT_READ", "INSTANT_ACTION", "APPROVAL_REQUIRED", "BACKGROUND_TASK", "CLARIFICATION_REQUIRED"] as const;
export type ExecutionClass = (typeof EXECUTION_CLASSES)[number];

export const EXECUTION_CLASS_LABELS: Record<ExecutionClass, string> = {
  INSTANT_READ: "Instant answer",
  INSTANT_ACTION: "Instant action",
  APPROVAL_REQUIRED: "Needs approval",
  BACKGROUND_TASK: "Background task",
  CLARIFICATION_REQUIRED: "Needs clarification",
};

export type ReplyLanguage = "en" | "hinglish" | "hi";

export interface Classification {
  cls: ExecutionClass;
  /** One plain sentence, shown in logs and the audit trail. */
  reason: string;
  language: ReplyLanguage;
  /** Only for CLARIFICATION_REQUIRED: the question to ask back. */
  question?: string;
}

export interface ClassifyOptions {
  /** The request was made from a record (lead, deal, …), so "this lead" is resolvable. */
  hasContext?: boolean;
  /** The person explicitly asked for background work (a UI toggle). Never turns a simple read into a task. */
  explicitBackground?: boolean;
}

const DEVANAGARI = /[ऀ-ॿ]/;
const HINGLISH = /\b(kitn[aie]|kitne|hai|hain|batao|bata do|dikhao|dikha do|kya|kaun|kaunse|kab|mera|mere|meri|aaj|abhi|karo|kar do|kardo|bana do|daal do|bhej do|chahiye|wala|wali|mein|ka status)\b/i;

export function detectLanguage(text: string): ReplyLanguage {
  if (DEVANAGARI.test(text)) return "hi";
  return HINGLISH.test(text) ? "hinglish" : "en";
}

/* Explicit hand-off to background work, in the person's own words. */
const EXPLICIT_BACKGROUND = /\b(in the background|background (task|mein|me)|run (it|this) later|do (it|this) later|baad mein|baad me|queue (it|this)|as a (background )?task|jab time mile|आराम से|बाद में)\b|बैकग्राउंड/i;

/* Multi-step or long-running work that a person would not wait for on screen. */
const BULK_NOUNS = "companies|compan(y|ies)|prospects?|leads?|proposals?|countries|records?|rows?|contacts?|emails?|accounts?|clients?|conversations?|pages?|articles?|websites?|profiles?";
const HEAVY_WORK = [
  // "Research 500 US fintech companies", "Find 1,000 qualified prospects", "Prepare 100 personalized proposals"
  new RegExp(`\\b\\d{1,3}(,\\d{3})+\\b|\\b([5-9]\\d|\\d{3,})\\b[^.?!]*\\b(${BULK_NOUNS})\\b`, "i"),
  /\b(across|in|for)\s+\d{2,}\s+(countries|markets|cities|regions|industries)\b/i,
  /\b(monitor|keep (an eye|watching)|watch (for|out)|track (all|every)|alert me (when|whenever)|nazar rakho)\b/i,
  /\b(run|do|send|check|repeat)\b[^.?!]*\b(every (day|morning|evening|night|week|monday|month|hour)|daily|weekly|monthly|roz|har (din|subah|hafte))\b/i,
  /\b(large|huge|big|entire|whole)\s+(dataset|data set|file|spreadsheet|csv|list|database)\b|\bbulk\b|\bprocess\b[^.?!]*\b(dataset|data set|csv|spreadsheet|file)\b/i,
  /\b(last|past)\s+\d+\s+(months|years)\b/i,
  /\b(research|investigate|analy[sz]e|audit|review|compile|prepare|build|write|draft|clean ?up|go through|enrich|find|prospect|score|qualify|follow ?up with|reach out to|contact)\b.*\b(all|every|each|entire|whole|list of|top \d+|\d{2,}|saare|sabhi|sab)\b/i,
  /\b(all|every|each|saare|sabhi)\b.*\b(leads?|deals?|clients?|invoices?|tickets?|projects?|accounts?|prospects?)\b.*\b(research|analy[sz]e|audit|review|enrich|score|qualify|update|email|contact|follow ?up|clean)\b/i,
  /\b(market research|competitor (analysis|research|landscape)|find (new )?(prospects|leads|companies)|build (a )?(list|pipeline)|prepare (a |the )?(report|deck|plan|proposal|strategy|analysis)|write (a |the )?(report|proposal|plan|strategy|blog|article)|weekly report|monthly report|deep dive|step[- ]by[- ]step plan)\b/i,
  /\b(for each|one by one|over the next|every (day|morning|evening|week|monday))\b/i,
  /(रिसर्च|रिपोर्ट तैयार|सभी .* (लीड|क्लाइंट))/,
];

/* Actions that always need a person's approval: customer contact, money, deletion, publishing, pricing. */
const APPROVAL_VERBS = [
  /\b(send|email|mail|message|whatsapp|sms|text|call)\b.*\b(to|client|customer|lead|prospect|them|him|her|invoice|proposal|quote|reminder)\b/i,
  /\b(delete|remove|archive|purge|erase|void|refund|write ?off|cancel (the |this |an? )?(invoice|payment|project|contract|subscription))\b/i,
  /\b(approve|reject|sign|publish|go live|deploy|discount|change (the )?price|pricing change|pay|make (a )?payments?|payout|transfer|mark (as )?paid|record (a )?payment|issue (the |this |an? )?invoice)\b/i,
  /\b(bhej do|bhejo|bhej de|delete kar|hata do|mita do|approve kar|refund kar)\b/i,
  /(भेज दो|भेजो|डिलीट|हटा दो|रिफंड|अप्रूव)/,
];

/* Simple, low-risk, single-record changes that existing controlled tools can do right away. */
const ACTION_VERBS = [
  /\b(assign|reassign)\b/i,
  /\b(add|log|write|leave|put)\b.*\b(notes?|comments?|activity|activities|remarks?)\b/i,
  /\b(create|add|set|schedule|book)\b.*\b(follow[- ]?ups?|reminders?|tasks?|to-?dos?|leads?|notes?|meetings?|calls?)\b/i,
  /\b(move|change|update|set|mark|shift)\b.*\b(to|as|status|stage|priority|owner|health)\b/i,
  /\b(mark|set|close)\b.*\b(complete|completed|done|finished|closed|resolved)\b/i,
  /\b(add|create|save)\b.*\b(contacts?|clients?|reminders?)\b/i,
  /\b(notify|ping|alert|remind)\b/i,
  /\b(draft|prepare)\b.*\b(email|reply|message|update|proposal)\b/i,
  /\b(assign kar|add kar|note (add|daal)|follow ?up (bana|laga|set)|bana do|kar do|kardo|daal do|laga do|set kar|update kar|move kar|shift kar)\b/i,
  /(असाइन|नोट (जोड़|डाल)|फॉलो ?अप (बना|लगा)|बना दो|कर दो|अपडेट कर)/,
];

/* Read-only questions: counts, totals, status, lists, lookups. */
const READ_SIGNALS = [
  /^\s*(how many|how much|what|what's|whats|which|who|whose|when|where|is there|are there|do we|did we|does|list|show|give me|tell me|get me|display|count|total|summar(y|ise|ize)|status|report on|overview)\b/i,
  /\b(how many|how much|count of|number of|total|status of|what('s| is) the status|any (new|open|overdue|pending)|pending|overdue|open|active|unpaid|online|present|today'?s|this (week|month)|my (tasks|leads|deals|tickets))\b/i,
  /\b(kitn[aie]|kitne|kya hai|kya status|ka status|batao|bata do|dikhao|dikha do|kaun|kaunse|konse|kab tak)\b/i,
  /(कितने|कितनी|कितना|क्या है|बताओ|बताइए|दिखाओ|दिखाइए|स्टेटस|कौन)/,
];

/* A question about something ("What is our refund policy?") is a read even when it names an action word. */
const QUESTION_FORM = /^\s*(what|what's|whats|how (many|much|is|are|do|does)|which|who|whose|when|where|why|is there|are there|do we|does|did|kya|kitn[aie]|kitne|kaun)\b|^\s*(क्या|कितने|कितनी|कौन)/i;
const IMPERATIVE_HINT = /\b(kar do|kardo|karo|bana do|bhej do|daal do|laga do|hata do|please|can you|could you|would you)\b/i;

/* A record referred to as "this / that / the" (or "is/us/iska" in Hinglish) that only context can resolve. */
const DEICTIC_RECORD = /\b(this|that|the same|iss?|us|iska|uska|is wal[ae]|us wal[ae])\s+(lead|deal|client|customer|account|invoice|ticket|project|proposal|task|contact)\b|\b(isko|usko|ise|use)\b|(इस|उस)\s*(लीड|डील|क्लाइंट|इनवॉइस|टिकट|प्रोजेक्ट)/i;

const any = (res: RegExp[], t: string) => res.some((r) => r.test(t));

const CLARIFY_TEXT: Record<ReplyLanguage, (what: string) => string> = {
  en: (what) => `Which ${what} do you mean? Tell me its name or reference, or open the record and ask me from there.`,
  hinglish: (what) => `Kaunsa ${what}? Uska naam ya reference batao, ya record kholkar wahan se poochho.`,
  hi: (what) => `कौन सा ${what}? उसका नाम या रेफरेंस बताइए, या रिकॉर्ड खोलकर वहीं से पूछिए।`,
};

/** Classifies one request. Order matters: the safest applicable class wins, and a plain read never becomes a task. */
export function classifyRequest(raw: string, opts: ClassifyOptions = {}): Classification {
  // "@sales …" picks an employee and "Sarah, …" addresses one; neither is part of the request itself.
  const text = raw.replace(/^@[a-z-]+\s+/i, "").replace(/^\s*[A-Z][a-z]+,\s+/, "").trim();
  const language = detectLanguage(text);
  const words = text.split(/\s+/).filter(Boolean).length;
  const read = any(READ_SIGNALS, text);
  const question = QUESTION_FORM.test(text) && !IMPERATIVE_HINT.test(text);
  const approval = !question && any(APPROVAL_VERBS, text);
  const action = !question && any(ACTION_VERBS, text);
  // Size alone ("last 12 months", "500 leads") never makes a question or a "show me" into a task; it takes work to do.
  const lookOnly = question || /^\s*(show|list|display|count|give me|tell me|get me|dikhao|batao)\b/i.test(text);
  const heavy = !lookOnly && (any(HEAVY_WORK, text) || (words > 60 && (action || approval)));
  const explicitBg = EXPLICIT_BACKGROUND.test(text);
  const mutating = approval || action;

  if (!text || (words <= 1 && !read)) {
    const q = { en: "What would you like me to do? Ask a question or give me an instruction.", hinglish: "Aap kya karwana chahte ho? Sawal poochho ya instruction do.", hi: "आप क्या करवाना चाहते हैं? सवाल पूछिए या निर्देश दीजिए।" }[language];
    return { cls: "CLARIFICATION_REQUIRED", reason: "The request is empty or too short to act on.", language, question: q };
  }

  // A plain question is answered on the spot, even if a background toggle was left on.
  if (read && !mutating && !heavy && !explicitBg) return { cls: "INSTANT_READ", reason: "Read-only question answered from live data.", language };

  // "Add this contact" creates something new, so it needs no open record; "assign this lead" acts on one.
  if (mutating && !opts.hasContext && DEICTIC_RECORD.test(text) && !/\b(add|create|save)\s+(this|that)\b/i.test(text)) {
    const what = text.match(/\b(lead|deal|client|customer|account|invoice|ticket|project|proposal|task|contact)\b/i)?.[1]?.toLowerCase() ?? (language === "en" ? "record" : "record");
    return { cls: "CLARIFICATION_REQUIRED", reason: `The request refers to "this ${what}" but no record is open.`, language, question: CLARIFY_TEXT[language](what) };
  }

  if (explicitBg || opts.explicitBackground) {
    if (read && !mutating && !heavy) return { cls: "INSTANT_READ", reason: "Read-only question answered from live data (background was not needed).", language };
    return { cls: "BACKGROUND_TASK", reason: explicitBg ? "The request asks for the work to be done in the background." : "Background work was requested.", language };
  }
  if (heavy) return { cls: "BACKGROUND_TASK", reason: "Multi-step or long-running work across many records.", language };
  if (approval) return { cls: "APPROVAL_REQUIRED", reason: "The action contacts someone, moves money, deletes or publishes, so a person must approve it.", language };
  if (action) return { cls: "INSTANT_ACTION", reason: "A simple, low-risk change done now with controlled tools.", language };
  // Anything else is conversational: answer now. Unrecognised requests never silently become background tasks.
  return { cls: "INSTANT_READ", reason: "Answered now; nothing in the request needs background work or a change.", language };
}
