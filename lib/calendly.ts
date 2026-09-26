import { siteConfig } from "@/data/siteConfig";

/**
 * Calendly booking link (public). NEXT_PUBLIC_CALENDLY_URL overrides it per environment.
 * If the value is ever not a calendly.com link, every "Book a Call" action falls back to the
 * on-site meeting request form, so no visitor lands on a broken link.
 */
export const DEFAULT_CALENDLY_URL = "https://calendly.com/shivacha-sales";

export const calendlyUrl = process.env.NEXT_PUBLIC_CALENDLY_URL || DEFAULT_CALENDLY_URL;

export const isCalendlyConfigured = () => /^https:\/\/calendly\.com\/[\w.-]+/.test(calendlyUrl);

/** Where "Book a Call" should go when opened as a normal link (new tab, no JavaScript, emails). */
export const bookCallHref = (siteUrl = "") => (isCalendlyConfigured() ? calendlyUrl : `${siteUrl}/book-a-meeting`);

/** Inline-embed URL for the Calendly iframe. */
export function calendlyEmbedUrl(opts: { name?: string; email?: string; theme?: "light" | "dark" } = {}) {
  if (!isCalendlyConfigured()) return null;
  const u = new URL(calendlyUrl);
  u.searchParams.set("embed_type", "Inline");
  if (typeof window !== "undefined") u.searchParams.set("embed_domain", window.location.hostname);
  u.searchParams.set("hide_gdpr_banner", "1");
  if (opts.theme === "dark") {
    u.searchParams.set("background_color", "0b1626");
    u.searchParams.set("text_color", "e9edf5");
  }
  u.searchParams.set("primary_color", "0195ff");
  if (opts.name) u.searchParams.set("name", opts.name);
  if (opts.email) u.searchParams.set("email", opts.email);
  return u.toString();
}

export const whatsappHref = (text?: string) => `${siteConfig.contact.whatsapp}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
