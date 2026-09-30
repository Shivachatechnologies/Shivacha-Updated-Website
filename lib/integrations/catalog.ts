/**
 * API & Integrations Center catalogue (pure). Every provider states honestly what this release does with it:
 *   vault: credentials can be entered in the UI (encrypted); otherwise environment variables only.
 *   support: SUPPORTED = code uses it · STATUS_ONLY = connection status shown, nothing automated ·
 *            NOT_SUPPORTED = no adapter in this release (never simulated).
 * Only the credential names listed here can ever be stored — the vault never accepts arbitrary variables.
 */

export type IntegrationCategory = "AI" | "Lead generation" | "Social" | "Advertising" | "Analytics" | "Communication" | "Research";
export type Support = "SUPPORTED" | "STATUS_ONLY" | "NOT_SUPPORTED";

export interface CredentialField {
  name: string;
  label: string;
  /** Secret values are masked; non-secret ids (page id, channel id) are still stored encrypted. */
  secret: boolean;
  optional?: boolean;
}

export interface IntegrationDef {
  key: string;
  name: string;
  category: IntegrationCategory;
  support: Support;
  auth: "API_KEY" | "ACCESS_TOKEN" | "SMTP" | "NONE";
  /** OAuth consent flows are not implemented: tokens are pasted from the provider's developer console. */
  oauthNote?: string;
  vault: boolean;
  fields: CredentialField[];
  capabilities: string[];
  note?: string;
}

const f = (name: string, label: string, secret = true, optional = false): CredentialField => ({ name, label, secret, optional });
const OAUTH = "OAuth sign-in is not implemented in this release: create a token in the provider's developer console and paste it here.";

export const INTEGRATIONS: IntegrationDef[] = [
  // AI
  { key: "anthropic", name: "Anthropic Claude", category: "AI", support: "SUPPORTED", auth: "API_KEY", vault: true, fields: [f("ANTHROPIC_API_KEY", "API key")], capabilities: ["Runs every AI employee", "Web research (with AI_WEB_SEARCH)"] },
  { key: "openai", name: "OpenAI (voice: speech-to-text / text-to-speech)", category: "AI", support: "SUPPORTED", auth: "API_KEY", vault: false, fields: [f("OPENAI_API_KEY", "API key")], capabilities: ["Voice employee speech"], note: "Environment variable only in this release (the voice pipeline reads it at start-up)." },
  { key: "gemini", name: "Google Gemini", category: "AI", support: "NOT_SUPPORTED", auth: "API_KEY", vault: false, fields: [], capabilities: [], note: "No Gemini adapter exists; AI employees run on Anthropic Claude." },
  // Lead generation
  { key: "apollo", name: "Apollo.io", category: "Lead generation", support: "SUPPORTED", auth: "API_KEY", vault: true, fields: [f("APOLLO_API_KEY", "API key")], capabilities: ["People search (discovery)"] },
  { key: "hunter", name: "Hunter.io", category: "Lead generation", support: "SUPPORTED", auth: "API_KEY", vault: true, fields: [f("HUNTER_API_KEY", "API key")], capabilities: ["Domain search (discovery)", "Email verification"] },
  // Social
  { key: "linkedin", name: "LinkedIn Page", category: "Social", support: "SUPPORTED", auth: "ACCESS_TOKEN", oauthNote: OAUTH, vault: true, fields: [f("LINKEDIN_ACCESS_TOKEN", "Access token"), f("LINKEDIN_ORGANIZATION_URN", "Organization URN (urn:li:organization:…)", false), f("LINKEDIN_API_VERSION", "API version (yyyymm)", false, true)], capabilities: ["Publish approved posts", "Follower count"] },
  { key: "facebook", name: "Facebook Page", category: "Social", support: "SUPPORTED", auth: "ACCESS_TOKEN", oauthNote: OAUTH, vault: true, fields: [f("META_PAGE_ID", "Page ID", false), f("META_PAGE_ACCESS_TOKEN", "Page access token"), f("META_GRAPH_VERSION", "Graph version (e.g. v21.0)", false, true)], capabilities: ["Publish approved posts", "Follower count"] },
  { key: "instagram", name: "Instagram Business", category: "Social", support: "SUPPORTED", auth: "ACCESS_TOKEN", oauthNote: OAUTH, vault: true, fields: [f("INSTAGRAM_BUSINESS_ACCOUNT_ID", "Business account ID", false), f("META_PAGE_ACCESS_TOKEN", "Page access token")], capabilities: ["Publish approved image posts", "Follower count"], note: "Reels and videos are uploaded from the Instagram app." },
  { key: "x", name: "X", category: "Social", support: "SUPPORTED", auth: "ACCESS_TOKEN", oauthNote: OAUTH, vault: true, fields: [f("X_ACCESS_TOKEN", "OAuth 2.0 user access token"), f("X_USER_ID", "User ID", false)], capabilities: ["Publish approved posts", "Follower count"] },
  { key: "youtube", name: "YouTube", category: "Social", support: "SUPPORTED", auth: "API_KEY", vault: true, fields: [f("YOUTUBE_API_KEY", "Data API key"), f("YOUTUBE_CHANNEL_ID", "Channel ID", false)], capabilities: ["Subscriber count"], note: "Video upload is manual (YouTube Studio)." },
  // Advertising
  { key: "meta-ads", name: "Meta Ads", category: "Advertising", support: "NOT_SUPPORTED", auth: "NONE", vault: false, fields: [], capabilities: [], note: "No ads adapter: campaigns, audiences, budgets and spend are not automated. Spend is entered on each campaign by a person." },
  { key: "google-ads", name: "Google Ads", category: "Advertising", support: "NOT_SUPPORTED", auth: "NONE", vault: false, fields: [], capabilities: [], note: "No ads adapter in this release." },
  { key: "linkedin-ads", name: "LinkedIn Ads", category: "Advertising", support: "NOT_SUPPORTED", auth: "NONE", vault: false, fields: [], capabilities: [], note: "No ads adapter in this release." },
  // Analytics
  { key: "ga4", name: "Google Analytics 4", category: "Analytics", support: "STATUS_ONLY", auth: "NONE", vault: false, fields: [], capabilities: ["Website tag"], note: "Tracking tag only; reports are not pulled into Shivacha OS." },
  { key: "gsc", name: "Google Search Console", category: "Analytics", support: "NOT_SUPPORTED", auth: "NONE", vault: false, fields: [], capabilities: [], note: "No Search Console adapter in this release." },
  // Communication
  { key: "email", name: "Email (Google Workspace SMTP / Gmail)", category: "Communication", support: "SUPPORTED", auth: "SMTP", vault: false, fields: [f("SMTP_USER", "SMTP user", false), f("SMTP_PASS", "SMTP password")], capabilities: ["Transactional and approved outbound email"], note: "Environment variables only (the mailer is shared with the public website)." },
  { key: "whatsapp", name: "WhatsApp Business", category: "Communication", support: "STATUS_ONLY", auth: "NONE", vault: false, fields: [], capabilities: ["Configured in the Communication center"], note: "Managed in Communication → WhatsApp." },
  { key: "tts", name: "Voice / TTS", category: "Communication", support: "SUPPORTED", auth: "API_KEY", vault: false, fields: [], capabilities: ["Voice employees"], note: "Uses the OpenAI key above." },
  // Research
  { key: "web-search", name: "AI web research (Anthropic web search)", category: "Research", support: "SUPPORTED", auth: "NONE", vault: false, fields: [], capabilities: ["Sourced market and company research"], note: "Enabled with AI_WEB_SEARCH=true and an Anthropic key." },
];

export const integrationByKey = (key: string) => INTEGRATIONS.find((i) => i.key === key);

/** Every credential name the vault may hold. */
export const VAULT_NAMES = new Set(INTEGRATIONS.filter((i) => i.vault).flatMap((i) => i.fields.map((x) => x.name)));

/** Masked display: last four characters of a secret; non-secrets are shown only by the page that owns them. */
export const maskHint = (v: string) => (v.length <= 4 ? "••••" : `••••${v.slice(-4)}`);
