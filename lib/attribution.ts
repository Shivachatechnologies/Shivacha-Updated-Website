/**
 * Marketing attribution captured in the browser and sent with every lead.
 * Model: last non-direct touch — a visit with UTM parameters replaces the stored values;
 * otherwise the first visit (landing page + external referrer) is kept.
 * Stored in localStorage only; failures are ignored so the site works with storage blocked.
 */
const KEY = "shv_attr";

export interface Attribution {
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  landing_page: string;
  referrer: string;
}

const empty: Attribution = { utm_source: "", utm_medium: "", utm_campaign: "", landing_page: "", referrer: "" };

export function captureAttribution() {
  try {
    const url = new URL(window.location.href);
    const utm = {
      utm_source: url.searchParams.get("utm_source") ?? "",
      utm_medium: url.searchParams.get("utm_medium") ?? "",
      utm_campaign: url.searchParams.get("utm_campaign") ?? "",
    };
    const stored = localStorage.getItem(KEY);
    if (!utm.utm_source && !utm.utm_medium && !utm.utm_campaign && stored) return;
    let referrer = "";
    if (document.referrer) {
      const r = new URL(document.referrer);
      if (r.host !== url.host) referrer = `${r.origin}${r.pathname}`.slice(0, 300);
    }
    const value: Attribution = { ...utm, landing_page: `${url.pathname}${url.search}`.slice(0, 300), referrer };
    localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
}

export function getAttribution(): Attribution {
  try {
    return { ...empty, ...(JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Attribution>) };
  } catch {
    return empty;
  }
}

/** Props added to analytics events so GA4 can report conversions by source. */
export function attributionProps() {
  const a = getAttribution();
  return { lead_source: a.utm_source || (a.referrer ? new URL(a.referrer).host : "direct"), utm_medium: a.utm_medium || undefined, utm_campaign: a.utm_campaign || undefined, landing_page: a.landing_page || undefined };
}
