/**
 * API & Integrations Center catalogue (pure). Every provider states honestly what this release does with it:
 *   vault: credentials can be entered in the UI (encrypted); otherwise environment variables only.
 *   oauth: the provider is connected with a real OAuth consent flow (lib/integrations/oauth.ts).
 *   support: SUPPORTED = code uses it · STATUS_ONLY = connect & test only, no feature uses it ·
 *            NOT_SUPPORTED = no adapter in this release (never simulated).
 * Only the credential names listed here can ever be stored — the vault never accepts arbitrary variables.
 */

export type IntegrationCategory = "OAuth apps" | "AI" | "Lead generation" | "Social" | "Advertising" | "Analytics" | "Communication" | "Research";
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
  auth: "API_KEY" | "ACCESS_TOKEN" | "OAUTH" | "SMTP" | "NONE";
  /** OAuth provider (lib/integrations/oauth.ts) that can connect this integration. */
  oauth?: "linkedin" | "meta" | "x" | "google";
  vault: boolean;
  fields: CredentialField[];
  capabilities: string[];
  note?: string;
}

const f = (name: string, label: string, secret = true, optional = false): CredentialField => ({ name, label, secret, optional });

export const INTEGRATIONS: IntegrationDef[] = [
  // OAuth apps: the client credentials of Shivacha's own app registration at each provider.
  { key: "linkedin-app", name: "LinkedIn app (OAuth)", category: "OAuth apps", support: "SUPPORTED", auth: "OAUTH", oauth: "linkedin", vault: true, fields: [f("LINKEDIN_CLIENT_ID", "Client ID", false), f("LINKEDIN_CLIENT_SECRET", "Client secret")], capabilities: ["Sign in with LinkedIn → Page posting, Page analytics, LinkedIn Ads"], note: "Create the app at linkedin.com/developers with the Community Management / Advertising API products; add the redirect URL shown below." },
  { key: "meta-app", name: "Meta app (OAuth)", category: "OAuth apps", support: "SUPPORTED", auth: "OAUTH", oauth: "meta", vault: true, fields: [f("META_APP_ID", "App ID", false), f("META_APP_SECRET", "App secret")], capabilities: ["Sign in with Facebook → Page and Instagram publishing and insights, Meta Ads"], note: "Create the app at developers.facebook.com; add the redirect URL shown below. Some permissions need Meta app review." },
  { key: "x-app", name: "X app (OAuth 2.0 with PKCE)", category: "OAuth apps", support: "SUPPORTED", auth: "OAUTH", oauth: "x", vault: true, fields: [f("X_CLIENT_ID", "Client ID", false), f("X_CLIENT_SECRET", "Client secret")], capabilities: ["Sign in with X → posting, follower count, post metrics (token refresh included)"] },
  { key: "google-app", name: "Google app (OAuth with PKCE)", category: "OAuth apps", support: "SUPPORTED", auth: "OAUTH", oauth: "google", vault: true, fields: [f("GOOGLE_OAUTH_CLIENT_ID", "Client ID", false), f("GOOGLE_OAUTH_CLIENT_SECRET", "Client secret")], capabilities: ["Sign in with Google → Analytics 4, Search Console, Google Ads (offline refresh token)"] },
  // AI
  { key: "anthropic", name: "Anthropic Claude", category: "AI", support: "SUPPORTED", auth: "API_KEY", vault: true, fields: [f("ANTHROPIC_API_KEY", "API key")], capabilities: ["Runs every AI employee", "Web research (with AI_WEB_SEARCH)"] },
  { key: "openai", name: "OpenAI (voice: speech-to-text / text-to-speech)", category: "AI", support: "SUPPORTED", auth: "API_KEY", vault: true, fields: [f("OPENAI_API_KEY", "API key")], capabilities: ["Voice employee speech"] },
  { key: "gemini", name: "Google Gemini", category: "AI", support: "STATUS_ONLY", auth: "API_KEY", vault: true, fields: [f("GEMINI_API_KEY", "API key")], capabilities: ["Connect and test only"], note: "AI employees run on Anthropic Claude; no feature sends work to Gemini in this release." },
  // Lead generation
  { key: "apollo", name: "Apollo.io", category: "Lead generation", support: "SUPPORTED", auth: "API_KEY", vault: true, fields: [f("APOLLO_API_KEY", "API key")], capabilities: ["People search (discovery)", "People match (email enrichment, uses credits)"] },
  { key: "hunter", name: "Hunter.io", category: "Lead generation", support: "SUPPORTED", auth: "API_KEY", vault: true, fields: [f("HUNTER_API_KEY", "API key")], capabilities: ["Domain search (discovery)", "Email finder (enrichment)", "Email verification"] },
  { key: "neverbounce", name: "NeverBounce (email verification)", category: "Lead generation", support: "SUPPORTED", auth: "API_KEY", vault: true, fields: [f("NEVERBOUNCE_API_KEY", "API key")], capabilities: ["Email verification (used when Hunter verification is not connected, or as the first choice when set)"] },
  // Social
  { key: "linkedin", name: "LinkedIn Page", category: "Social", support: "SUPPORTED", auth: "OAUTH", oauth: "linkedin", vault: true, fields: [f("LINKEDIN_ACCESS_TOKEN", "Access token (set by Sign in with LinkedIn, or pasted)"), f("LINKEDIN_ORGANIZATION_URN", "Organization URN (urn:li:organization:…)", false), f("LINKEDIN_API_VERSION", "API version (yyyymm)", false, true)], capabilities: ["Publish approved posts", "Follower count", "Post likes & comments"] },
  { key: "facebook", name: "Facebook Page", category: "Social", support: "SUPPORTED", auth: "OAUTH", oauth: "meta", vault: true, fields: [f("META_PAGE_ID", "Page ID (set by Sign in with Facebook)", false), f("META_PAGE_ACCESS_TOKEN", "Page access token"), f("META_GRAPH_VERSION", "Graph version (e.g. v21.0)", false, true)], capabilities: ["Publish approved posts", "Follower count", "Post impressions & engagement"] },
  { key: "instagram", name: "Instagram Business", category: "Social", support: "SUPPORTED", auth: "OAUTH", oauth: "meta", vault: true, fields: [f("INSTAGRAM_BUSINESS_ACCOUNT_ID", "Business account ID", false), f("META_PAGE_ACCESS_TOKEN", "Page access token")], capabilities: ["Publish approved image posts", "Follower count", "Post reach & engagement"], note: "Reels and videos are uploaded from the Instagram app." },
  { key: "x", name: "X", category: "Social", support: "SUPPORTED", auth: "OAUTH", oauth: "x", vault: true, fields: [f("X_ACCESS_TOKEN", "OAuth 2.0 user access token"), f("X_USER_ID", "User ID", false)], capabilities: ["Publish approved posts", "Follower count", "Post public metrics"] },
  { key: "youtube", name: "YouTube", category: "Social", support: "SUPPORTED", auth: "API_KEY", vault: true, fields: [f("YOUTUBE_API_KEY", "Data API key"), f("YOUTUBE_CHANNEL_ID", "Channel ID", false)], capabilities: ["Subscriber count", "Video view/like counts for published video IDs"], note: "Video upload is manual (YouTube Studio)." },
  // Advertising
  { key: "meta-ads", name: "Meta Ads", category: "Advertising", support: "SUPPORTED", auth: "OAUTH", oauth: "meta", vault: true, fields: [f("META_AD_ACCOUNT_ID", "Ad account ID (act_…)", false), f("META_ADS_ACCESS_TOKEN", "System-user token (optional; otherwise the Meta sign-in token)", true, true)], capabilities: ["Create campaign + ad set + link ad (always PAUSED)", "Launch / pause / budget (approval)", "Spend & results sync"] },
  { key: "google-ads", name: "Google Ads", category: "Advertising", support: "SUPPORTED", auth: "OAUTH", oauth: "google", vault: true, fields: [f("GOOGLE_ADS_DEVELOPER_TOKEN", "Developer token"), f("GOOGLE_ADS_CUSTOMER_ID", "Customer ID (digits)", false), f("GOOGLE_ADS_LOGIN_CUSTOMER_ID", "Manager (login) customer ID", false, true)], capabilities: ["Create Search campaign + budget (always PAUSED)", "Launch / pause / budget (approval)", "Spend & results sync"], note: "Ad groups, keywords and ads are created in Google Ads by a person." },
  { key: "linkedin-ads", name: "LinkedIn Ads", category: "Advertising", support: "SUPPORTED", auth: "OAUTH", oauth: "linkedin", vault: true, fields: [f("LINKEDIN_AD_ACCOUNT_ID", "Ad account ID (digits)", false)], capabilities: ["Create campaign group + campaign (always PAUSED)", "Launch / pause / budget (approval)", "Spend & results sync"], note: "Creatives are attached in Campaign Manager by a person." },
  // Analytics
  { key: "ga4", name: "Google Analytics 4", category: "Analytics", support: "SUPPORTED", auth: "OAUTH", oauth: "google", vault: true, fields: [f("GA4_PROPERTY_ID", "Property ID (digits)", false)], capabilities: ["Sessions, users and conversions (Data API) in the CEO briefing"] },
  { key: "gsc", name: "Google Search Console", category: "Analytics", support: "SUPPORTED", auth: "OAUTH", oauth: "google", vault: true, fields: [f("GSC_SITE_URL", "Property (e.g. sc-domain:shivacha.com)", false)], capabilities: ["Search clicks, impressions, CTR and position"] },
  // Communication
  { key: "email", name: "Email (Google Workspace SMTP / Gmail)", category: "Communication", support: "SUPPORTED", auth: "SMTP", vault: false, fields: [f("SMTP_USER", "SMTP user", false), f("SMTP_PASS", "SMTP password")], capabilities: ["Transactional and approved outbound email"], note: "Environment variables only (the mailer is shared with the public website and must work before sign-in)." },
  { key: "whatsapp", name: "WhatsApp Business", category: "Communication", support: "STATUS_ONLY", auth: "NONE", vault: false, fields: [], capabilities: ["Configured in the Communication center"], note: "Managed in Communication → WhatsApp." },
  { key: "tts", name: "Voice / TTS", category: "Communication", support: "SUPPORTED", auth: "API_KEY", vault: false, fields: [], capabilities: ["Voice employees"], note: "Uses the OpenAI key above." },
  // Research
  { key: "web-search", name: "AI web research (Anthropic web search)", category: "Research", support: "SUPPORTED", auth: "NONE", vault: false, fields: [], capabilities: ["Sourced market and company research"], note: "Enabled with AI_WEB_SEARCH=true and an Anthropic key." },
];

export const integrationByKey = (key: string) => INTEGRATIONS.find((i) => i.key === key);

/** Written only by the OAuth flows (never typed in). */
const OAUTH_ONLY = ["LINKEDIN_REFRESH_TOKEN", "META_USER_ACCESS_TOKEN", "X_REFRESH_TOKEN", "GOOGLE_REFRESH_TOKEN"];

/** Every credential name the vault may hold. */
export const VAULT_NAMES = new Set([...INTEGRATIONS.filter((i) => i.vault).flatMap((i) => i.fields.map((x) => x.name)), ...OAUTH_ONLY]);

/** Masked display: last four characters of a secret; non-secrets are shown only by the page that owns them. */
export const maskHint = (v: string) => (v.length <= 4 ? "••••" : `••••${v.slice(-4)}`);
