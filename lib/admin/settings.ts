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
} as const;

export type SettingKey = keyof typeof SETTING_SCHEMAS;
export type SiteSettings = z.infer<(typeof SETTING_SCHEMAS)["site"]>;
export type SeoSettings = z.infer<(typeof SETTING_SCHEMAS)["seo"]>;

export const SETTING_DEFAULTS: { site: SiteSettings; seo: SeoSettings } = {
  site: { announcementEnabled: false, announcementText: "", announcementHref: "", contactEmail: "", contactPhone: "" },
  seo: { defaultDescription: "", defaultOgImage: "", allowIndexing: true, disallowPaths: "" },
};
