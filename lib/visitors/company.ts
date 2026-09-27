import "server-only";
import type { CompanyProvider } from "./policy";

/**
 * Company identification provider abstraction. A provider returns an organisation only when it has a reliable,
 * business-type match for the IP; ISPs, mobile carriers, hosting and unknown IPs return null. Nothing is guessed:
 * the admin UI shows "Company not identified" when there is no match. The IP is used for the lookup only and never stored.
 */
export interface CompanyMatch {
  provider: string;
  key: string;
  name: string;
  domain: string | null;
  industry: string | null;
  country: string | null;
  city: string | null;
  asn: string | null;
  sizeRange: string | null;
}

export interface CompanyLookup {
  readonly id: CompanyProvider;
  configured(): boolean;
  lookup(ip: string): Promise<CompanyMatch | null>;
}

const PRIVATE_IP = /^(10\.|127\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|::1$|fc|fd|fe80)/i;

/** IPinfo: uses the `company` block (business plans), and only when IPinfo classifies it as a business. */
export const ipinfoProvider: CompanyLookup = {
  id: "IPINFO",
  configured: () => !!process.env.IPINFO_TOKEN,
  async lookup(ip) {
    const token = process.env.IPINFO_TOKEN;
    if (!token || !ip || PRIVATE_IP.test(ip)) return null;
    const res = await fetch(`https://ipinfo.io/${encodeURIComponent(ip)}/json`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, signal: AbortSignal.timeout(2500), cache: "no-store" }).catch(() => null);
    if (!res?.ok) return null;
    const j = (await res.json().catch(() => null)) as { company?: { name?: string; domain?: string; type?: string }; asn?: { asn?: string }; country?: string; city?: string } | null;
    const c = j?.company;
    if (!c?.name || c.type !== "business") return null;
    const key = (c.domain || c.name).toLowerCase().slice(0, 120);
    return { provider: "ipinfo", key: `ipinfo:${key}`, name: c.name.slice(0, 160), domain: c.domain?.slice(0, 120) ?? null, industry: null, country: j?.country ?? null, city: j?.city ?? null, asn: j?.asn?.asn ?? null, sizeRange: null };
  },
};

const PROVIDERS: Record<CompanyProvider, CompanyLookup | null> = { NONE: null, IPINFO: ipinfoProvider };

export const companyProvider = (id: CompanyProvider) => {
  const p = PROVIDERS[id];
  return p && p.configured() ? p : null;
};
