"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

type Config = { enabled: boolean; consentRequired: boolean; honorGpc: boolean };
type Consent = "granted" | "denied" | null;

const CONSENT = "shivacha_consent";
const EXCLUDED = /^\/(admin|employee|client|p)(\/|$)/;

/** Maps site analytics events (lib/analytics track()) to first-party visitor event types. */
const EVENT_MAP: Record<string, string> = {
  cta_click: "cta_click",
  demo_click: "cta_click",
  case_study_cta: "cta_click",
  estimator_cta: "cta_click",
  form_start: "form_start",
  estimator_start: "form_start",
  generate_lead: "form_submit",
  contact_submit: "form_submit",
  calendly_click: "calendly_click",
  calendly_booked: "calendly_click",
  whatsapp_click: "whatsapp_click",
  phone_click: "phone_click",
  email_click: "email_click",
  lead_magnet_download: "download",
  search: "search",
};

const readConsent = (): Consent => {
  const m = document.cookie.match(/(?:^|;\s*)shivacha_consent=(granted|denied)/);
  return (m?.[1] as Consent) ?? null;
};

function send(payload: Record<string, unknown>) {
  // text/plain keeps the request simple; keepalive lets page_leave finish during navigation.
  fetch("/api/v/collect", { method: "POST", body: JSON.stringify(payload), headers: { "Content-Type": "text/plain" }, keepalive: true, credentials: "same-origin" }).catch(() => undefined);
}

/**
 * First-party visitor tracking with consent. Does nothing until the server says tracking is enabled; when consent is
 * required it asks first and records nothing unless the visitor accepts. Global Privacy Control is honoured.
 */
export function VisitorTracker() {
  const pathname = usePathname();
  const [config, setConfig] = useState<Config | null>(null);
  const [consent, setConsent] = useState<Consent>(null);
  const [banner, setBanner] = useState(false);
  const pageStart = useRef<{ path: string; at: number } | null>(null);
  const first = useRef(true);

  useEffect(() => {
    let alive = true;
    fetch("/api/v/config")
      .then((r) => (r.ok ? r.json() : null))
      .then((c: Config | null) => {
        if (!alive || !c?.enabled) return;
        const gpc = (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;
        if (c.honorGpc && gpc) return;
        const current = readConsent();
        setConfig(c);
        setConsent(current);
        if (c.consentRequired && !current) setBanner(true);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const allowed = !!config && consent !== "denied" && (!config.consentRequired || consent === "granted");

  const leave = useCallback(() => {
    const p = pageStart.current;
    if (!p) return;
    const seconds = Math.min(1800, Math.round((Date.now() - p.at) / 1000));
    if (seconds >= 1) send({ type: "page_leave", path: p.path, seconds });
    pageStart.current = null;
  }, []);

  // Page views (and time on the previous page).
  useEffect(() => {
    if (!allowed || EXCLUDED.test(pathname)) return;
    leave();
    const url = new URL(window.location.href);
    const utm = first.current ? { source: url.searchParams.get("utm_source"), medium: url.searchParams.get("utm_medium"), campaign: url.searchParams.get("utm_campaign"), term: url.searchParams.get("utm_term"), content: url.searchParams.get("utm_content") } : null;
    send({ type: "page_view", path: pathname, title: document.title.slice(0, 300), referrer: first.current ? document.referrer || null : null, utm, screen: `${window.screen.width}x${window.screen.height}`, language: navigator.language, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone });
    first.current = false;
    pageStart.current = { path: pathname, at: Date.now() };
  }, [allowed, pathname, leave]);

  // Engagement time when the tab is hidden; interactions from the existing analytics layer.
  useEffect(() => {
    if (!allowed) return;
    const onHide = () => {
      if (document.visibilityState === "hidden") leave();
      else if (!pageStart.current && !EXCLUDED.test(window.location.pathname)) pageStart.current = { path: window.location.pathname, at: Date.now() };
    };
    const onTrack = (e: Event) => {
      const { event, props } = (e as CustomEvent<{ event: string; props: Record<string, unknown> }>).detail ?? {};
      const type = EVENT_MAP[event];
      if (!type || EXCLUDED.test(window.location.pathname)) return;
      const label = typeof props?.label === "string" ? props.label : typeof props?.href === "string" ? props.href : event;
      send({ type, path: window.location.pathname, label: String(label).slice(0, 200) });
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("shv:track", onTrack);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("shv:track", onTrack);
    };
  }, [allowed, leave]);

  // "Cookie choices" links reopen the banner.
  useEffect(() => {
    if (!config) return;
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest('a[href$="#cookie-choices"]');
      if (!a) return;
      e.preventDefault();
      setBanner(true);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [config]);

  const decide = (v: "granted" | "denied") => {
    document.cookie = `${CONSENT}=${v}; Path=/; Max-Age=${180 * 86_400}; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
    setConsent(v);
    setBanner(false);
    // Tell the server so any existing tracking cookies are cleared immediately.
    if (v === "denied") send({ type: "interaction", path: window.location.pathname, label: "consent_declined" });
  };

  if (!banner || !config || EXCLUDED.test(pathname)) return null;
  return (
    <div role="dialog" aria-live="polite" aria-label="Cookie choices" className="fixed inset-x-3 bottom-3 z-[60] mx-auto max-w-xl rounded-xl border border-white/10 bg-ink-900/95 p-4 text-sm text-fg shadow-2xl backdrop-blur sm:inset-x-auto sm:right-4">
      <p>
        We use first-party cookies to understand how visitors use this site (pages viewed, time on site, approximate country and city). We don&apos;t sell this data or use it for advertising.{" "}
        <Link href="/cookie-policy" className="underline">Cookie policy</Link>
      </p>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={() => decide("granted")} className="h-9 rounded-md bg-brand-blue px-4 font-semibold text-white">Accept</button>
        <button type="button" onClick={() => decide("denied")} className="h-9 rounded-md border border-white/20 px-4">Decline</button>
      </div>
    </div>
  );
}
