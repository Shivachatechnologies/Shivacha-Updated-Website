/**
 * Analytics abstraction. Events are forwarded to whichever tools are configured (GA4, Meta Pixel, LinkedIn),
 * and to window.dataLayer for tag managers / CRM connectors. Safe to call when no tools are loaded.
 */
export type AnalyticsEvent =
  | "product_view"
  | "demo_click"
  | "demo_request"
  | "contact_submit"
  | "book_meeting"
  | "start_project"
  | "search"
  | "cta_click"
  | "whatsapp_click"
  | "email_click"
  | "phone_click"
  | "resource_request"
  | "newsletter_signup"
  | "job_apply";

type Props = Record<string, string | number | boolean | undefined>;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    fbq?: (...args: unknown[]) => void;
    lintrk?: (...args: unknown[]) => void;
  }
}

export function track(event: AnalyticsEvent, props: Props = {}) {
  if (typeof window === "undefined") return;
  try {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event, ...props });
    window.gtag?.("event", event, props);
    if (event === "contact_submit" || event === "demo_request" || event === "start_project") {
      window.fbq?.("track", "Lead", props);
      window.lintrk?.("track", { conversion_id: event });
    }
  } catch {
    /* analytics must never break the page */
  }
}
