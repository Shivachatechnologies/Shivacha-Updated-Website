import "server-only";
import { mailMode } from "@/lib/email/mailer";
import { sendEmailMessage } from "@/lib/communication/providers";
import { analyticsConnections } from "@/lib/marketing/attribution";
import { webSearchEnabled } from "@/lib/ai/provider";
import { openaiVoice } from "@/lib/voice/provider";
import type { SocialPlatform } from "./policy";
import { secretValue } from "@/lib/integrations/vault";
import { trackedFetch } from "@/lib/integrations/usage";
import { refreshXToken } from "@/lib/integrations/oauth";
import { adsProviders } from "@/lib/ads/providers";

/**
 * Growth provider abstraction. Every provider reports NOT_CONNECTED when its credentials are missing and never
 * pretends an action succeeded: a result is `ok: true` only when the external API confirmed it. Credentials come
 * from environment secrets only; they are never stored in the database, logged or returned to the browser.
 */
export type ProviderCode = "NOT_CONNECTED" | "NOT_SUPPORTED" | "PROVIDER_ERROR";
export type ProviderResult<T> = { ok: true; data: T } | { ok: false; code: ProviderCode; error: string };

export const PROVIDER_KINDS = ["ads", "social", "email", "lead", "enrichment", "search", "analytics", "image", "video", "tts"] as const;
export type ProviderKind = (typeof PROVIDER_KINDS)[number];

/** CONNECTED = credentials present and code uses them · NOT_CONNECTED = credentials missing · NOT_SUPPORTED = no code performs this automatically. */
export type ProviderState = "CONNECTED" | "NOT_CONNECTED" | "NOT_SUPPORTED";

export interface ProviderStatus {
  key: string;
  kind: ProviderKind;
  name: string;
  /** True only when the credentials are present AND this release has code that uses them. */
  connected: boolean;
  state?: ProviderState;
  /** Names of the environment variables it needs (names only — values are never shown). */
  env: string[];
  note?: string;
}

/** Environment first, then credentials connected in the API & Integrations Center (encrypted vault). */
const env = (k: string) => secretValue(k);
const set = (...keys: string[]) => keys.every((k) => env(k).length > 0);
const notConnected = <T>(name: string, keys: string[]): ProviderResult<T> => ({ ok: false, code: "NOT_CONNECTED", error: `${name} is not connected (set ${keys.join(", ")}).` });
const TIMEOUT = 15_000;

async function call(url: string, init: RequestInit & { json?: unknown } = {}): Promise<{ ok: boolean; status: number; body: Record<string, unknown>; headers: Headers }> {
  const { json, ...rest } = init;
  // Counted per provider per day, paused during a 429 cool-down, capped daily (lib/integrations/usage.ts).
  const res = await trackedFetch(url, { ...rest, body: json !== undefined ? JSON.stringify(json) : rest.body, headers: { ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...(rest.headers ?? {}) }, signal: AbortSignal.timeout(TIMEOUT), cache: "no-store" });
  const text = await res.text();
  let body: Record<string, unknown> = {};
  try {
    body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    body = { raw: text.slice(0, 300) };
  }
  return { ok: res.ok, status: res.status, body, headers: res.headers };
}

/** Provider error text without echoing request URLs (which can contain keys). */
const apiError = (name: string, r: { status: number; body: Record<string, unknown> }) => {
  const e = r.body.error as { message?: string } | string | undefined;
  const msg = typeof e === "string" ? e : (e?.message ?? (r.body.message as string | undefined) ?? (r.body.detail as string | undefined) ?? "request failed");
  return { ok: false as const, code: "PROVIDER_ERROR" as const, error: `${name}: ${String(msg).slice(0, 300)} (HTTP ${r.status})` };
};
const guard = async <T>(name: string, fn: () => Promise<ProviderResult<T>>): Promise<ProviderResult<T>> => {
  try {
    return await fn();
  } catch (e) {
    return { ok: false, code: "PROVIDER_ERROR", error: `${name}: ${(e as Error).name === "TimeoutError" ? "timed out" : "network error"}` };
  }
};

/* ───────────────────────── social ───────────────────────── */

export interface PublishInput {
  body: string;
  link?: string | null;
  mediaUrl?: string | null;
  format?: string;
}
export interface SocialProvider {
  platform: SocialPlatform;
  status(): ProviderStatus;
  publish(p: PublishInput): Promise<ProviderResult<{ externalId: string }>>;
  followers(): Promise<ProviderResult<{ followers: number }>>;
}

const GRAPH = () => `https://graph.facebook.com/${env("META_GRAPH_VERSION") || "v21.0"}`;
const LI_KEYS = ["LINKEDIN_ACCESS_TOKEN", "LINKEDIN_ORGANIZATION_URN"];
const FB_KEYS = ["META_PAGE_ID", "META_PAGE_ACCESS_TOKEN"];
const IG_KEYS = ["INSTAGRAM_BUSINESS_ACCOUNT_ID", "META_PAGE_ACCESS_TOKEN"];
const X_KEYS = ["X_ACCESS_TOKEN", "X_USER_ID"];
const YT_KEYS = ["YOUTUBE_API_KEY", "YOUTUBE_CHANNEL_ID"];

const linkedin: SocialProvider = {
  platform: "LINKEDIN",
  status: () => ({ key: "linkedin", kind: "social", name: "LinkedIn Page (Community Management API)", connected: set(...LI_KEYS), env: [...LI_KEYS, "LINKEDIN_API_VERSION"] }),
  publish: (p) =>
    set(...LI_KEYS)
      ? guard("LinkedIn", async () => {
          const r = await call("https://api.linkedin.com/rest/posts", {
            method: "POST",
            headers: { Authorization: `Bearer ${env("LINKEDIN_ACCESS_TOKEN")}`, "LinkedIn-Version": env("LINKEDIN_API_VERSION") || "202409", "X-Restli-Protocol-Version": "2.0.0" },
            json: { author: env("LINKEDIN_ORGANIZATION_URN"), commentary: p.link ? `${p.body}\n\n${p.link}` : p.body, visibility: "PUBLIC", distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] }, lifecycleState: "PUBLISHED", isReshareDisabledByAuthor: false },
          });
          const id = r.headers.get("x-restli-id");
          return r.ok && id ? { ok: true, data: { externalId: id } } : apiError("LinkedIn", r);
        })
      : Promise.resolve(notConnected("LinkedIn", LI_KEYS)),
  followers: () =>
    set(...LI_KEYS)
      ? guard("LinkedIn", async () => {
          const r = await call(`https://api.linkedin.com/rest/networkSizes/${encodeURIComponent(env("LINKEDIN_ORGANIZATION_URN"))}?edgeType=COMPANY_FOLLOWED_BY_MEMBER`, { headers: { Authorization: `Bearer ${env("LINKEDIN_ACCESS_TOKEN")}`, "LinkedIn-Version": env("LINKEDIN_API_VERSION") || "202409" } });
          const n = Number(r.body.firstDegreeSize);
          return r.ok && Number.isFinite(n) ? { ok: true, data: { followers: n } } : apiError("LinkedIn", r);
        })
      : Promise.resolve(notConnected("LinkedIn", LI_KEYS)),
};

const facebook: SocialProvider = {
  platform: "FACEBOOK",
  status: () => ({ key: "facebook", kind: "social", name: "Facebook Page (Graph API)", connected: set(...FB_KEYS), env: [...FB_KEYS, "META_GRAPH_VERSION"] }),
  publish: (p) =>
    set(...FB_KEYS)
      ? guard("Facebook", async () => {
          const r = await call(`${GRAPH()}/${env("META_PAGE_ID")}/feed`, { method: "POST", json: { message: p.body, ...(p.link ? { link: p.link } : {}), access_token: env("META_PAGE_ACCESS_TOKEN") } });
          return r.ok && typeof r.body.id === "string" ? { ok: true, data: { externalId: r.body.id } } : apiError("Facebook", r);
        })
      : Promise.resolve(notConnected("Facebook", FB_KEYS)),
  followers: () =>
    set(...FB_KEYS)
      ? guard("Facebook", async () => {
          const r = await call(`${GRAPH()}/${env("META_PAGE_ID")}?fields=followers_count&access_token=${encodeURIComponent(env("META_PAGE_ACCESS_TOKEN"))}`);
          const n = Number(r.body.followers_count);
          return r.ok && Number.isFinite(n) ? { ok: true, data: { followers: n } } : apiError("Facebook", r);
        })
      : Promise.resolve(notConnected("Facebook", FB_KEYS)),
};

const instagram: SocialProvider = {
  platform: "INSTAGRAM",
  status: () => ({ key: "instagram", kind: "social", name: "Instagram Business (Graph API)", connected: set(...IG_KEYS), env: IG_KEYS, note: "Image posts publish automatically; reels/videos are uploaded from the Instagram app." }),
  publish: (p) => {
    if (!set(...IG_KEYS)) return Promise.resolve(notConnected("Instagram", IG_KEYS));
    if (!p.mediaUrl) return Promise.resolve({ ok: false, code: "NOT_SUPPORTED", error: "Instagram needs an image (mediaUrl) to publish." });
    if (/\.(mp4|mov|webm)(\?|$)/i.test(p.mediaUrl) || /REEL|VIDEO/.test(p.format ?? "")) return Promise.resolve({ ok: false, code: "NOT_SUPPORTED", error: "Instagram reels/videos are not published automatically; upload from the Instagram app." });
    return guard("Instagram", async () => {
      const ig = env("INSTAGRAM_BUSINESS_ACCOUNT_ID");
      const token = env("META_PAGE_ACCESS_TOKEN");
      const c = await call(`${GRAPH()}/${ig}/media`, { method: "POST", json: { image_url: p.mediaUrl, caption: p.link ? `${p.body}\n\n${p.link}` : p.body, access_token: token } });
      if (!c.ok || typeof c.body.id !== "string") return apiError("Instagram", c);
      const r = await call(`${GRAPH()}/${ig}/media_publish`, { method: "POST", json: { creation_id: c.body.id, access_token: token } });
      return r.ok && typeof r.body.id === "string" ? { ok: true, data: { externalId: r.body.id } } : apiError("Instagram", r);
    });
  },
  followers: () =>
    set(...IG_KEYS)
      ? guard("Instagram", async () => {
          const r = await call(`${GRAPH()}/${env("INSTAGRAM_BUSINESS_ACCOUNT_ID")}?fields=followers_count&access_token=${encodeURIComponent(env("META_PAGE_ACCESS_TOKEN"))}`);
          const n = Number(r.body.followers_count);
          return r.ok && Number.isFinite(n) ? { ok: true, data: { followers: n } } : apiError("Instagram", r);
        })
      : Promise.resolve(notConnected("Instagram", IG_KEYS)),
};

/** X call with the stored user token; on 401 the OAuth refresh token is used once to get a new access token. */
async function xCall(url: string, init: RequestInit & { json?: unknown } = {}) {
  const auth = () => ({ ...(init.headers ?? {}), Authorization: `Bearer ${env("X_ACCESS_TOKEN")}` });
  let r = await call(url, { ...init, headers: auth() });
  if (r.status === 401 && (await refreshXToken())) r = await call(url, { ...init, headers: auth() });
  return r;
}

const x: SocialProvider = {
  platform: "X",
  status: () => ({ key: "x", kind: "social", name: "X (API v2, OAuth 2.0 user token)", connected: set(...X_KEYS), env: X_KEYS }),
  publish: (p) =>
    set(...X_KEYS)
      ? guard("X", async () => {
          const text = p.link ? `${p.body}\n\n${p.link}` : p.body;
          const r = await xCall("https://api.x.com/2/tweets", { method: "POST", json: { text } });
          const id = (r.body.data as { id?: string } | undefined)?.id;
          return r.ok && id ? { ok: true, data: { externalId: id } } : apiError("X", r);
        })
      : Promise.resolve(notConnected("X", X_KEYS)),
  followers: () =>
    set(...X_KEYS)
      ? guard("X", async () => {
          const r = await xCall(`https://api.x.com/2/users/${encodeURIComponent(env("X_USER_ID"))}?user.fields=public_metrics`);
          const n = Number((r.body.data as { public_metrics?: { followers_count?: number } } | undefined)?.public_metrics?.followers_count);
          return r.ok && Number.isFinite(n) ? { ok: true, data: { followers: n } } : apiError("X", r);
        })
      : Promise.resolve(notConnected("X", X_KEYS)),
};

const youtube: SocialProvider = {
  platform: "YOUTUBE",
  status: () => ({ key: "youtube", kind: "social", name: "YouTube Data API", connected: set(...YT_KEYS), env: YT_KEYS, note: "Subscriber metrics are pulled automatically; videos are uploaded from YouTube Studio." }),
  publish: async () => ({ ok: false, code: "NOT_SUPPORTED", error: "YouTube videos are uploaded from YouTube Studio; mark the post as published with its video ID once it is live." }),
  followers: () =>
    set(...YT_KEYS)
      ? guard("YouTube", async () => {
          const r = await call(`https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${encodeURIComponent(env("YOUTUBE_CHANNEL_ID"))}&key=${encodeURIComponent(env("YOUTUBE_API_KEY"))}`);
          const item = (r.body.items as { statistics?: { subscriberCount?: string; hiddenSubscriberCount?: boolean } }[] | undefined)?.[0];
          if (item?.statistics?.hiddenSubscriberCount) return { ok: false, code: "NOT_SUPPORTED", error: "The channel hides its subscriber count." };
          const n = Number(item?.statistics?.subscriberCount);
          return r.ok && Number.isFinite(n) ? { ok: true, data: { followers: n } } : apiError("YouTube", r);
        })
      : Promise.resolve(notConnected("YouTube", YT_KEYS)),
};

export const SOCIAL_PROVIDERS: Record<SocialPlatform, SocialProvider> = { LINKEDIN: linkedin, INSTAGRAM: instagram, FACEBOOK: facebook, X: x, YOUTUBE: youtube };

/* ───────────────────────── email ───────────────────────── */

export const emailProvider = {
  status: (): ProviderStatus => ({ key: "email", kind: "email", name: "Email (existing Google Workspace SMTP / Gmail OAuth)", connected: mailMode() !== "none", env: ["SMTP_USER", "SMTP_PASS", "GMAIL_OAUTH_REFRESH_TOKEN", "GROWTH_UNSUBSCRIBE_SECRET"], note: "Growth emails also need GROWTH_UNSUBSCRIBE_SECRET (or APP_ENCRYPTION_KEY) to sign unsubscribe links." }),
  async send(to: string, subject: string, body: string): Promise<ProviderResult<{ provider: string }>> {
    if (mailMode() === "none") return notConnected("Email", ["SMTP_USER", "SMTP_PASS"]);
    const r = await sendEmailMessage(to, subject, body);
    return r.sent ? { ok: true, data: { provider: r.provider } } : { ok: false, code: "PROVIDER_ERROR", error: r.error ?? "Email was not sent." };
  },
};

/** Secret used to sign unsubscribe links. Without it, growth email is disabled (every email must be unsubscribable). */
export const unsubscribeSecret = () => env("GROWTH_UNSUBSCRIBE_SECRET") || (env("APP_ENCRYPTION_KEY").length >= 32 ? env("APP_ENCRYPTION_KEY") : "");

/* ───────────────────────── lead & enrichment (legitimate B2B data providers) ───────────────────────── */

export interface ProspectRecord {
  company: string;
  domain: string | null;
  contactName: string | null;
  title: string | null;
  email: string | null;
  country: string | null;
  industry: string | null;
  confidence: number | null;
}

export const leadProviders = {
  hunter: {
    status: (): ProviderStatus => ({ key: "hunter", kind: "lead", name: "Hunter.io (domain search)", connected: set("HUNTER_API_KEY"), env: ["HUNTER_API_KEY"], note: "Returns published business contacts for a company domain. Contacts are prospects, not leads." }),
    async domainSearch(domain: string, limit = 10): Promise<ProviderResult<ProspectRecord[]>> {
      if (!set("HUNTER_API_KEY")) return notConnected("Hunter", ["HUNTER_API_KEY"]);
      return guard("Hunter", async () => {
        const r = await call(`https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(domain)}&limit=${Math.min(limit, 25)}&type=personal&api_key=${encodeURIComponent(env("HUNTER_API_KEY"))}`);
        if (!r.ok) return apiError("Hunter", r);
        const d = r.body.data as { organization?: string; country?: string; industry?: string; emails?: { value: string; first_name?: string; last_name?: string; position?: string; confidence?: number }[] };
        return { ok: true, data: (d.emails ?? []).map((e) => ({ company: d.organization || domain, domain, contactName: [e.first_name, e.last_name].filter(Boolean).join(" ") || null, title: e.position ?? null, email: e.value ?? null, country: d.country ?? null, industry: d.industry ?? null, confidence: e.confidence ?? null })) };
      });
    },
  },
  apollo: {
    status: (): ProviderStatus => ({ key: "apollo", kind: "lead", name: "Apollo.io (people search)", connected: set("APOLLO_API_KEY"), env: ["APOLLO_API_KEY"], note: "Search returns people and companies; emails need Apollo enrichment credits." }),
    async peopleSearch(q: { domains?: string[]; titles?: string[]; countries?: string[]; perPage?: number }): Promise<ProviderResult<ProspectRecord[]>> {
      if (!set("APOLLO_API_KEY")) return notConnected("Apollo", ["APOLLO_API_KEY"]);
      return guard("Apollo", async () => {
        const r = await call("https://api.apollo.io/api/v1/mixed_people/search", { method: "POST", headers: { "X-Api-Key": env("APOLLO_API_KEY"), "Cache-Control": "no-cache" }, json: { q_organization_domains_list: q.domains, person_titles: q.titles, person_locations: q.countries, page: 1, per_page: Math.min(q.perPage ?? 10, 25) } });
        if (!r.ok) return apiError("Apollo", r);
        const people = (r.body.people as { name?: string; title?: string; country?: string; email?: string | null; organization?: { name?: string; primary_domain?: string; industry?: string } }[] | undefined) ?? [];
        return { ok: true, data: people.map((p) => ({ company: p.organization?.name ?? "(unknown)", domain: p.organization?.primary_domain ?? null, contactName: p.name ?? null, title: p.title ?? null, email: p.email && !/not_unlocked|email_not_unlocked/.test(p.email) ? p.email : null, country: p.country ?? null, industry: p.organization?.industry ?? null, confidence: null })) };
      });
    },
  },
};

export const enrichmentProvider = {
  status: (): ProviderStatus => ({ key: "hunter-verify", kind: "enrichment", name: "Email verification (Hunter)", connected: set("HUNTER_API_KEY"), env: ["HUNTER_API_KEY"] }),
  async verifyEmail(email: string): Promise<ProviderResult<{ status: string; deliverable: boolean }>> {
    if (!set("HUNTER_API_KEY")) return notConnected("Email verification", ["HUNTER_API_KEY"]);
    return guard("Hunter", async () => {
      const r = await call(`https://api.hunter.io/v2/email-verifier?email=${encodeURIComponent(email)}&api_key=${encodeURIComponent(env("HUNTER_API_KEY"))}`);
      if (!r.ok) return apiError("Hunter", r);
      const s = String((r.body.data as { status?: string } | undefined)?.status ?? "unknown");
      return { ok: true, data: { status: s, deliverable: s === "valid" } };
    });
  },
};

/* ───────────────────────── status of every provider ───────────────────────── */

export function providerStatuses(): ProviderStatus[] {
  const ads = analyticsConnections();
  const adKeys = new Set(["meta", "gads", "linkedin"]);
  const withState = (p: ProviderStatus): ProviderStatus => ({ ...p, state: p.state ?? (p.connected ? "CONNECTED" : "NOT_CONNECTED") });
  const list: ProviderStatus[] = [
    // Automated ad actions do not exist: credentials only enable the existing manual spend reporting.
    // Paid media runs in the Advertising OS (lib/ads): connected only with its own ad account + token; campaigns are
    // created paused and launched only through approval and spend limits. The growth loop itself never buys ads.
    ...ads.filter((a) => adKeys.has(a.key)).map((a): ProviderStatus => {
      const adapter = adsProviders[a.key === "gads" ? "google" : (a.key as "meta" | "linkedin")];
      return { key: `ads-${a.key}`, kind: "ads", name: adapter.name, connected: adapter.connected(), state: adapter.connected() ? "CONNECTED" : "NOT_CONNECTED", env: a.env, note: "Managed on Growth → Advertising: created paused; launch and budget increases need approval and spend limits; spend is synced from the platform." };
    }),
    ...Object.values(SOCIAL_PROVIDERS).map((p) => p.status()),
    emailProvider.status(),
    leadProviders.apollo.status(),
    leadProviders.hunter.status(),
    enrichmentProvider.status(),
    { key: "search", kind: "search", name: "AI web research (existing Research agent)", connected: webSearchEnabled(), env: ["ANTHROPIC_API_KEY", "AI_WEB_SEARCH"] },
    ...ads.filter((a) => !adKeys.has(a.key)).map((a): ProviderStatus => ({ key: `analytics-${a.key}`, kind: "analytics", name: a.name, connected: a.connected, env: a.env, note: "Connection status only; reports are not pulled automatically." })),
    { key: "image", kind: "image", name: "Image generation", connected: false, state: "NOT_SUPPORTED", env: [], note: "Not implemented: the creative engine writes image briefs for a designer." },
    { key: "video", kind: "video", name: "Video generation / editing", connected: false, state: "NOT_SUPPORTED", env: [], note: "Not implemented: reels and videos are produced from AI-written scripts by a person." },
    { key: "tts", kind: "tts", name: "Text-to-speech (existing voice provider)", connected: openaiVoice.configured(), env: ["OPENAI_API_KEY", "OPENAI_TTS_MODEL"] },
  ];
  return list.map(withState);
}
