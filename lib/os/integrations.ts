import "server-only";
import { channels } from "@/lib/communication/providers";
import { PAYMENT_PROVIDERS } from "@/lib/payments";
import { analyticsConnections } from "@/lib/marketing/attribution";
import { providerStatus } from "@/lib/ai/provider";

export interface IntegrationInfo {
  key: string;
  name: string;
  category: "AI" | "Communication" | "Payments" | "Marketing & analytics" | "Scheduling" | "Storage & data" | "Security";
  connected: boolean;
  /** Environment variable NAMES (never values). */
  env: string[];
  note?: string;
  href?: string;
}

const set = (k: string) => !!process.env[k];

/** Every external integration and whether it is configured. Status is derived from env presence only. */
export function integrations(): IntegrationInfo[] {
  const ai = providerStatus();
  return [
    { key: "anthropic", name: "Anthropic Claude (AI workforce)", category: "AI", connected: ai.connected, env: ["ANTHROPIC_API_KEY", "AI_MODEL"], href: "/admin/ai", note: "Without it agents return live data only — no AI analysis is generated." },
    { key: "web-search", name: "AI web research", category: "AI", connected: ai.connected && process.env.AI_WEB_SEARCH === "true", env: ["AI_WEB_SEARCH"], note: "Anthropic server-side web search for the Research agent (billed per search)." },
    ...channels().map((c) => ({ key: c.key, name: c.name, category: "Communication" as const, connected: c.connected, env: c.env, note: c.note, href: "/admin/communication" })),
    ...PAYMENT_PROVIDERS.map((p) => ({ key: p.key.toLowerCase(), name: p.name, category: "Payments" as const, connected: p.isConfigured(), env: p.key === "STRIPE" ? ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"] : ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET"], href: "/admin/finance/payments", note: "Payments stay PENDING until a verified webhook or a finance manager confirms them." })),
    ...analyticsConnections().map((a) => ({ key: a.key, name: a.name, category: "Marketing & analytics" as const, connected: a.connected, env: a.env, href: "/admin/marketing", note: a.tracking ? "Website tracking tag is installed." : undefined })),
    { key: "calendly", name: "Calendly (meeting webhooks)", category: "Scheduling", connected: set("CALENDLY_WEBHOOK_SIGNING_KEY"), env: ["CALENDLY_WEBHOOK_SIGNING_KEY", "NEXT_PUBLIC_CALENDLY_URL"], href: "/admin/communication/meetings" },
    { key: "sheets", name: "Google Sheets lead sync", category: "Storage & data", connected: set("GOOGLE_SHEETS_LEADS_ID") || set("GOOGLE_SHEETS_WEBHOOK_URL"), env: ["GOOGLE_SHEETS_LEADS_ID", "GOOGLE_SERVICE_ACCOUNT_EMAIL"] },
    { key: "crm-webhook", name: "External CRM webhook", category: "Storage & data", connected: set("CRM_WEBHOOK_URL"), env: ["CRM_WEBHOOK_URL", "CRM_WEBHOOK_SECRET"] },
    { key: "blob", name: "Vercel Blob (documents & media)", category: "Storage & data", connected: set("BLOB_READ_WRITE_TOKEN"), env: ["BLOB_READ_WRITE_TOKEN"], note: "Required for uploads in production." },
    { key: "turnstile", name: "Cloudflare Turnstile (form bot protection)", category: "Security", connected: set("TURNSTILE_SECRET_KEY"), env: ["TURNSTILE_SECRET_KEY"] },
    { key: "cron", name: "Daily scheduler (Vercel Cron)", category: "Security", connected: set("CRON_SECRET"), env: ["CRON_SECRET"], href: "/admin/system", note: "Runs insights, reminders, overdue checks and the CEO briefing." },
  ];
}
