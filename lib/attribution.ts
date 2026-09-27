/**
 * Marketing attribution captured in the browser and sent with every lead.
 *
 * - Latest touch (`shv_attr`): last non-direct touch — a visit with UTM parameters replaces the stored
 *   values; otherwise the first visit (landing page + external referrer) is kept.
 * - First touch (`shv_attr_first`): written once, never overwritten.
 * - Engagement (`shv_eng`): visit count, pages viewed and high-intent pages seen.
 *
 * Stored in localStorage only; failures are ignored so the site works with storage blocked.
 */
const KEY = "shv_attr";
const FIRST = "shv_attr_first";
const ENG = "shv_eng";
const SESSION = "shv_session";

export interface Attribution {
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_term: string;
  utm_content: string;
  landing_page: string;
  referrer: string;
}

interface FirstTouch extends Attribution {
  at: string;
}

interface Engagement {
  visits: number;
  pages: number;
  intent: string[];
}

const empty: Attribution = { utm_source: "", utm_medium: "", utm_campaign: "", utm_term: "", utm_content: "", landing_page: "", referrer: "" };

/** Pages that signal buying intent. */
const INTENT = /^\/(start-a-project|project-estimator|book-a-meeting|request-demo|hire-|hire-developers|lp\/|white-label-development|dedicated-teams|contact)/;

const read = <T,>(k: string, fallback: T): T => {
  try {
    return { ...fallback, ...(JSON.parse(localStorage.getItem(k) ?? "null") ?? {}) };
  } catch {
    return fallback;
  }
};

function currentTouch(url: URL): Attribution {
  let referrer = "";
  if (document.referrer) {
    const r = new URL(document.referrer);
    if (r.host !== url.host) referrer = `${r.origin}${r.pathname}`.slice(0, 300);
  }
  const p = (k: string) => (url.searchParams.get(k) ?? "").slice(0, 160);
  return { utm_source: p("utm_source"), utm_medium: p("utm_medium"), utm_campaign: p("utm_campaign"), utm_term: p("utm_term"), utm_content: p("utm_content"), landing_page: `${url.pathname}${url.search}`.slice(0, 300), referrer };
}

/** Call once per page load (first-touch / latest-touch capture). */
export function captureAttribution() {
  try {
    const url = new URL(window.location.href);
    const touch = currentTouch(url);
    if (!localStorage.getItem(FIRST)) localStorage.setItem(FIRST, JSON.stringify({ ...touch, at: new Date().toISOString() } satisfies FirstTouch));
    const hasUtm = !!(touch.utm_source || touch.utm_medium || touch.utm_campaign);
    if (hasUtm || !localStorage.getItem(KEY)) localStorage.setItem(KEY, JSON.stringify(touch));
    const eng = read<Engagement>(ENG, { visits: 0, pages: 0, intent: [] });
    if (!sessionStorage.getItem(SESSION)) {
      sessionStorage.setItem(SESSION, "1");
      eng.visits += 1;
    }
    localStorage.setItem(ENG, JSON.stringify(eng));
  } catch {
    /* storage unavailable */
  }
}

/** Call on every client-side route change. */
export function recordPageView(path: string) {
  try {
    const eng = read<Engagement>(ENG, { visits: 1, pages: 0, intent: [] });
    eng.pages += 1;
    if (INTENT.test(path) && !eng.intent.includes(path)) eng.intent = [...eng.intent, path].slice(-8);
    localStorage.setItem(ENG, JSON.stringify(eng));
  } catch {
    /* storage unavailable */
  }
}

function device() {
  const w = window.innerWidth;
  const touch = navigator.maxTouchPoints > 0;
  return w < 768 ? "Mobile" : w < 1100 && touch ? "Tablet" : "Desktop";
}

/** Flat fields sent with every form submission (validated server-side). */
export function getAttribution(): Record<string, string> {
  try {
    const last = read<Attribution>(KEY, empty);
    const first = read<FirstTouch>(FIRST, { ...empty, at: "" });
    const eng = read<Engagement>(ENG, { visits: 1, pages: 1, intent: [] });
    return {
      ...last,
      first_source: first.utm_source || (first.referrer ? new URL(first.referrer).host : first.landing_page ? "direct" : ""),
      first_medium: first.utm_medium,
      first_campaign: first.utm_campaign,
      first_landing: first.landing_page,
      first_referrer: first.referrer,
      first_seen: first.at,
      device: device(),
      visits: String(Math.max(1, eng.visits)),
      pages_viewed: String(Math.max(1, eng.pages)),
      intent_pages: eng.intent.join(", ").slice(0, 300),
    };
  } catch {
    return { ...empty };
  }
}

/** Props added to analytics events so GA4 can report conversions by source. */
export function attributionProps() {
  const a = read<Attribution>(KEY, empty);
  let host = "direct";
  try {
    if (a.referrer) host = new URL(a.referrer).host;
  } catch {
    /* ignore */
  }
  return { lead_source: a.utm_source || host, utm_medium: a.utm_medium || undefined, utm_campaign: a.utm_campaign || undefined, landing_page: a.landing_page || undefined };
}
