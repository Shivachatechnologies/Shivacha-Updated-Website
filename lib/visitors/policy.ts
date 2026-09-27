import { z } from "zod";

/**
 * Website visitor tracking settings (Setting key "visitorTracking"). Tracking is OFF until an administrator turns it
 * on, consent is required by default, Global Privacy Control is honoured, and retention is never chosen for you.
 */
export const CONSENT_MODES = {
  REQUIRED: "Ask for consent first (banner); track only after the visitor accepts",
  NOT_REQUIRED: "Track without a banner (only where your legal basis allows it)",
} as const;
export type ConsentMode = keyof typeof CONSENT_MODES;

export const COMPANY_PROVIDERS = {
  NONE: "None (company is never identified)",
  IPINFO: "IPinfo (needs IPINFO_TOKEN with company data)",
} as const;
export type CompanyProvider = keyof typeof COMPANY_PROVIDERS;

export const VISITOR_RETENTION_CHOICES = [30, 90, 180, 365] as const;

const bool = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());

export const visitorPolicySchema = z.object({
  enabled: bool,
  consentMode: z.enum(Object.keys(CONSENT_MODES) as [ConsentMode, ...ConsentMode[]]),
  honorGpc: bool,
  /** Store approximate city (from the hosting provider's IP geolocation). Country is always kept when tracking. */
  captureCity: bool,
  companyProvider: z.enum(Object.keys(COMPANY_PROVIDERS) as [CompanyProvider, ...CompanyProvider[]]),
  /** Days to keep sessions and events (null = not configured, nothing is purged). */
  retentionDays: z.preprocess((v) => (v == null || v === "" ? null : Number(v)), z.number().int().min(7).max(3650).nullable()),
  /** Paths never tracked (prefix match), one per line. */
  excludePaths: z.preprocess((v) => (Array.isArray(v) ? v : String(v ?? "").split(/\r?\n/)), z.array(z.string().trim().max(200)).transform((a) => a.filter((p) => p.startsWith("/")).slice(0, 50))),
  /** Minutes without activity before a visitor drops off the live list. */
  liveWindowMinutes: z.preprocess((v) => (v == null || v === "" ? 5 : Number(v)), z.number().int().min(1).max(60)),
});
export type VisitorPolicy = z.infer<typeof visitorPolicySchema>;

export const VISITOR_DEFAULTS: VisitorPolicy = {
  enabled: false,
  consentMode: "REQUIRED",
  honorGpc: true,
  captureCity: true,
  companyProvider: "NONE",
  retentionDays: null,
  excludePaths: ["/admin", "/employee", "/client", "/p/"],
  liveWindowMinutes: 5,
};

export const parseVisitorPolicy = (v: unknown): VisitorPolicy => {
  const r = visitorPolicySchema.safeParse({ ...VISITOR_DEFAULTS, ...(v && typeof v === "object" ? v : {}) });
  return r.success ? r.data : VISITOR_DEFAULTS;
};

/** Whether this request may be tracked. Pure, so the rules are unit-tested. */
export function trackingDecision(p: VisitorPolicy, req: { consent: string | null; gpc: boolean; bot: boolean; path: string }): { track: boolean; reason: string } {
  if (!p.enabled) return { track: false, reason: "disabled" };
  if (req.bot) return { track: false, reason: "bot" };
  if (p.honorGpc && req.gpc) return { track: false, reason: "gpc" };
  if (req.consent === "denied") return { track: false, reason: "declined" };
  if (p.consentMode === "REQUIRED" && req.consent !== "granted") return { track: false, reason: "no-consent" };
  if (p.excludePaths.some((x) => req.path === x || req.path.startsWith(x.endsWith("/") ? x : `${x}/`))) return { track: false, reason: "excluded" };
  return { track: true, reason: "ok" };
}
