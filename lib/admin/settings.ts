import { z } from "zod";

/**
 * Non-secret site settings stored in the Setting table. Secrets (SMTP, API keys, database URL,
 * tokens) are environment variables only and are never accepted here.
 */
const bool = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());
const text = (max: number) => z.preprocess((v) => (v == null ? "" : v), z.string().trim().max(max));
const link = z.preprocess((v) => (v == null ? "" : v), z.string().trim().max(2000).refine((v) => !v || /^(https:\/\/|\/(?!\/)|mailto:|tel:)/.test(v), "Use https://, a site path, mailto: or tel:"));

export const SETTING_SCHEMAS = {
  site: z.object({
    announcementEnabled: bool,
    announcementText: text(160),
    announcementHref: link,
    contactEmail: z.preprocess((v) => (v == null ? "" : v), z.string().trim().max(160).refine((v) => !v || z.string().email().safeParse(v).success, "Invalid email")),
    contactPhone: text(40).refine((v) => !v || /^[+\d][\d\s()-]{6,}$/.test(v), "Invalid phone number"),
  }),
  seo: z.object({
    defaultDescription: text(300),
    defaultOgImage: link,
    allowIndexing: bool,
    disallowPaths: text(2000).refine((v) => v.split(/\r?\n/).every((l) => !l.trim() || /^\/[^\s]*$/.test(l.trim())), "One path per line, each starting with /"),
  }),
  /** Business targets shown on the command-center dashboard. Empty = no target (nothing is assumed). */
  targets: z.object({
    monthlyRevenue: z.preprocess((v) => (v == null || v === "" ? null : Number(String(v).replace(/[,\s]/g, ""))), z.number({ error: "Enter a number" }).min(0).max(1e12).nullable()),
    currency: z.enum(["USD", "EUR", "GBP", "AED", "SAR", "INR", "SGD", "AUD", "CAD"]),
  }),
} as const;

export type SettingKey = keyof typeof SETTING_SCHEMAS;
export type SiteSettings = z.infer<(typeof SETTING_SCHEMAS)["site"]>;
export type SeoSettings = z.infer<(typeof SETTING_SCHEMAS)["seo"]>;
export type TargetSettings = z.infer<(typeof SETTING_SCHEMAS)["targets"]>;

export const SETTING_DEFAULTS: { site: SiteSettings; seo: SeoSettings; targets: TargetSettings } = {
  site: { announcementEnabled: false, announcementText: "", announcementHref: "", contactEmail: "", contactPhone: "" },
  seo: { defaultDescription: "", defaultOgImage: "", allowIndexing: true, disallowPaths: "" },
  targets: { monthlyRevenue: null, currency: "USD" },
};
