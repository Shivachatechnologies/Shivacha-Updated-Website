import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { db } from "@/lib/db/client";
import { siteConfig } from "@/data/siteConfig";
import { audit } from "@/lib/audit";
import { hydrateVault, secretValue, storeSecret } from "./vault";
import { trackedFetch } from "./usage";
import { missingScopes, scrubSecrets, tokenError, tokenExpired } from "./health-rules";

/**
 * OAuth 2.0 authorisation-code flows for providers that support it. Real flows only:
 * - `state` is random, stored server-side, bound to the signed-in admin, single-use and valid for 10 minutes (CSRF);
 * - PKCE (S256) is used where the provider supports it;
 * - tokens are exchanged server-side and stored only in the encrypted vault — never in cookies, logs or the page;
 * - a provider counts as CONNECTED only after a successful token exchange (and the usual test call).
 * The app's client ID / secret come from the provider's developer console and are entered on the Integrations page.
 */

export type OAuthProvider = "linkedin" | "meta" | "x" | "google";

interface OAuthDef {
  name: string;
  authUrl: () => string;
  tokenUrl: () => string;
  scopes: string[];
  clientId: string;
  clientSecret: string;
  pkce: boolean;
  /** Confidential client credentials sent as HTTP Basic (X) instead of in the body. */
  basic?: boolean;
  scopeSeparator?: string;
  extra?: Record<string, string>;
  /** Catalogue integrations this authorisation connects. */
  connects: string[];
}

const GRAPH = () => process.env.META_GRAPH_VERSION || secretValue("META_GRAPH_VERSION") || "v21.0";

export const OAUTH: Record<OAuthProvider, OAuthDef> = {
  linkedin: { name: "LinkedIn", authUrl: () => "https://www.linkedin.com/oauth/v2/authorization", tokenUrl: () => "https://www.linkedin.com/oauth/v2/accessToken", scopes: ["w_organization_social", "r_organization_social", "rw_organization_admin", "rw_ads", "r_ads_reporting"], clientId: "LINKEDIN_CLIENT_ID", clientSecret: "LINKEDIN_CLIENT_SECRET", pkce: false, scopeSeparator: " ", connects: ["linkedin", "linkedin-ads"] },
  meta: { name: "Meta (Facebook, Instagram, Meta Ads)", authUrl: () => `https://www.facebook.com/${GRAPH()}/dialog/oauth`, tokenUrl: () => `https://graph.facebook.com/${GRAPH()}/oauth/access_token`, scopes: ["pages_show_list", "pages_manage_posts", "pages_read_engagement", "read_insights", "instagram_basic", "instagram_content_publish", "instagram_manage_insights", "ads_management", "ads_read"], clientId: "META_APP_ID", clientSecret: "META_APP_SECRET", pkce: false, scopeSeparator: ",", connects: ["facebook", "instagram", "meta-ads"] },
  x: { name: "X", authUrl: () => "https://x.com/i/oauth2/authorize", tokenUrl: () => "https://api.x.com/2/oauth2/token", scopes: ["tweet.read", "tweet.write", "users.read", "offline.access"], clientId: "X_CLIENT_ID", clientSecret: "X_CLIENT_SECRET", pkce: true, basic: true, scopeSeparator: " ", connects: ["x"] },
  google: { name: "Google (YouTube, Analytics, Search Console, Google Ads)", authUrl: () => "https://accounts.google.com/o/oauth2/v2/auth", tokenUrl: () => "https://oauth2.googleapis.com/token", scopes: ["https://www.googleapis.com/auth/youtube.readonly", "https://www.googleapis.com/auth/analytics.readonly", "https://www.googleapis.com/auth/webmasters.readonly", "https://www.googleapis.com/auth/adwords"], clientId: "GOOGLE_OAUTH_CLIENT_ID", clientSecret: "GOOGLE_OAUTH_CLIENT_SECRET", pkce: true, scopeSeparator: " ", extra: { access_type: "offline", prompt: "consent", include_granted_scopes: "true" }, connects: ["youtube", "ga4", "gsc", "google-ads"] },
};

/** Vault names written by the OAuth flows (in addition to the client credentials). */
export const OAUTH_TOKEN_NAMES = ["LINKEDIN_ACCESS_TOKEN", "LINKEDIN_REFRESH_TOKEN", "META_USER_ACCESS_TOKEN", "META_PAGE_ID", "META_PAGE_ACCESS_TOKEN", "INSTAGRAM_BUSINESS_ACCOUNT_ID", "X_ACCESS_TOKEN", "X_REFRESH_TOKEN", "X_USER_ID", "GOOGLE_REFRESH_TOKEN"];

/** Tokens each sign-in writes (removed again when the app is disconnected). */
export const OAUTH_TOKENS: Record<OAuthProvider, string[]> = { linkedin: ["LINKEDIN_ACCESS_TOKEN", "LINKEDIN_REFRESH_TOKEN"], meta: ["META_USER_ACCESS_TOKEN", "META_PAGE_ACCESS_TOKEN", "META_PAGE_ID", "INSTAGRAM_BUSINESS_ACCOUNT_ID"], x: ["X_ACCESS_TOKEN", "X_REFRESH_TOKEN", "X_USER_ID"], google: ["GOOGLE_REFRESH_TOKEN"] };

export const isOAuthProvider = (p: string): p is OAuthProvider => p in OAUTH;
export const redirectUri = () => `${(process.env.OAUTH_REDIRECT_BASE || siteConfig.url).replace(/\/$/, "")}/api/integrations/oauth/callback`;
const b64url = (b: Buffer) => b.toString("base64url");
const STATE_TTL = 10 * 60_000;

export class OAuthError extends Error {
  /** Scrubbed provider detail — for the audit log only, never shown in the page. */
  detail?: string;
  constructor(message: string, readonly kind: "CANCELLED" | "INVALID_STATE" | "EXPIRED" | "REJECTED" | "INSUFFICIENT_PERMISSION" | "UNAVAILABLE" | "RATE_LIMITED" | "CONFIG" = "REJECTED") {
    super(message);
  }
}

/** Builds the provider's consent URL and records the one-time state. */
export async function startOAuth(provider: OAuthProvider, userId: string): Promise<string> {
  await hydrateVault(true);
  const d = OAUTH[provider];
  const clientId = secretValue(d.clientId);
  if (!clientId || !secretValue(d.clientSecret)) throw new OAuthError(`Enter the ${d.name} app's client ID and client secret first (from the provider's developer console).`, "CONFIG");
  await db.oAuthState.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - STATE_TTL) } } });
  const state = b64url(randomBytes(24));
  const verifier = b64url(randomBytes(48));
  await db.oAuthState.create({ data: { state, provider, codeVerifier: verifier, userId } });
  const q = new URLSearchParams({ response_type: "code", client_id: clientId, redirect_uri: redirectUri(), state, scope: d.scopes.join(d.scopeSeparator ?? " "), ...(d.extra ?? {}) });
  if (d.pkce) {
    q.set("code_challenge", b64url(createHash("sha256").update(verifier).digest()));
    q.set("code_challenge_method", "S256");
  }
  return `${d.authUrl()}?${q.toString()}`;
}

async function tokenRequest(d: OAuthDef, body: Record<string, string>) {
  const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" };
  const form = new URLSearchParams(body);
  if (d.basic) headers.Authorization = `Basic ${Buffer.from(`${secretValue(d.clientId)}:${secretValue(d.clientSecret)}`).toString("base64")}`;
  else {
    form.set("client_id", secretValue(d.clientId));
    form.set("client_secret", secretValue(d.clientSecret));
  }
  let res: Response;
  try {
    res = await trackedFetch(d.tokenUrl(), { method: "POST", headers, body: form.toString(), signal: AbortSignal.timeout(15_000), cache: "no-store" });
  } catch {
    throw new OAuthError(`${d.name}: provider unavailable (no response). Try again later.`, "UNAVAILABLE");
  }
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || typeof json.access_token !== "string") {
    const detail = scrubSecrets(String(json.error_description ?? (json.error as { message?: string } | undefined)?.message ?? json.error ?? ""), [secretValue(d.clientSecret), body.code ?? "", body.refresh_token ?? ""]);
    const e = new OAuthError(res.ok ? `${d.name} answered without an access token.` : tokenError(d.name, res.status, json), res.status === 429 ? "RATE_LIMITED" : String(json.error ?? "") === "invalid_grant" ? "EXPIRED" : res.status >= 500 ? "UNAVAILABLE" : "REJECTED");
    e.detail = detail.slice(0, 200);
    throw e;
  }
  return json as { access_token: string; refresh_token?: string; expires_in?: number; scope?: string };
}

async function getJson(url: string, headers: Record<string, string> = {}) {
  const res = await trackedFetch(url, { headers, signal: AbortSignal.timeout(15_000), cache: "no-store" });
  return { ok: res.ok, status: res.status, body: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

async function record(provider: OAuthProvider, config: Record<string, unknown>) {
  const key = `oauth:${provider}`;
  const v = JSON.parse(JSON.stringify({ ...config, connectedAt: new Date().toISOString() }));
  await db.integration.upsert({ where: { key }, update: { status: "CONNECTED", lastSyncAt: new Date(), lastError: null, config: v }, create: { key, status: "CONNECTED", lastSyncAt: new Date(), config: v } });
}

/** Completes the flow from the callback. Throws OAuthError with a user-safe message. */
export async function completeOAuth(state: string, code: string, userId: string): Promise<{ provider: OAuthProvider; message: string }> {
  const row = await db.oAuthState.findUnique({ where: { state } });
  // Single use: whoever deletes the row owns it; replays find nothing.
  const used = await db.oAuthState.deleteMany({ where: { state } });
  if (!row || !used.count) throw new OAuthError("Invalid state: this sign-in link has expired or was already used. Start again.", "INVALID_STATE");
  if (row.userId !== userId) throw new OAuthError("Invalid state: this sign-in was started by another user.", "INVALID_STATE");
  if (Date.now() - row.createdAt.getTime() > STATE_TTL) throw new OAuthError("Invalid state: this sign-in took longer than 10 minutes. Start again.", "INVALID_STATE");
  if (!isOAuthProvider(row.provider)) throw new OAuthError("Invalid state: unknown provider.", "INVALID_STATE");
  const provider = row.provider;
  const d = OAUTH[provider];
  await hydrateVault(true);
  const t = await tokenRequest(d, { grant_type: "authorization_code", code, redirect_uri: redirectUri(), ...(d.pkce ? { code_verifier: row.codeVerifier } : {}) });
  const expiresAt = t.expires_in ? new Date(Date.now() + t.expires_in * 1000).toISOString() : null;
  // Providers that report granted scopes: a missing one limits what the dependent integrations can do — say which.
  const missing = missingScopes(d.scopes, t.scope, d.scopeSeparator);
  const scopeNote = missing.length ? ` Insufficient permission: not granted — ${missing.join(", ")}. Features that need them stay unavailable until the app is approved for them.` : "";

  if (provider === "linkedin") {
    await storeSecret("LINKEDIN_ACCESS_TOKEN", "linkedin", t.access_token, userId);
    if (t.refresh_token) await storeSecret("LINKEDIN_REFRESH_TOKEN", "linkedin", t.refresh_token, userId);
    await record(provider, { expiresAt, refresh: !!t.refresh_token, missingScopes: missing });
    return { provider, message: `LinkedIn connected. Set the organization URN if it is not set yet.${scopeNote}` };
  }
  if (provider === "x") {
    await storeSecret("X_ACCESS_TOKEN", "x", t.access_token, userId);
    if (t.refresh_token) await storeSecret("X_REFRESH_TOKEN", "x", t.refresh_token, userId);
    const me = await getJson("https://api.x.com/2/users/me", { Authorization: `Bearer ${t.access_token}` });
    const id = (me.body.data as { id?: string } | undefined)?.id;
    if (id) await storeSecret("X_USER_ID", "x", id, userId);
    await record(provider, { expiresAt, refresh: !!t.refresh_token, userId: id ?? null, username: (me.body.data as { username?: string } | undefined)?.username ?? null, missingScopes: missing });
    return { provider, message: `${id ? "X connected." : "X issued a token, but the account id could not be read; test the connection."}${scopeNote}` };
  }
  if (provider === "google") {
    if (!t.refresh_token) throw new OAuthError("Google did not return a refresh token. Remove the app's access in your Google account and connect again.", "REJECTED");
    await storeSecret("GOOGLE_REFRESH_TOKEN", "google", t.refresh_token, userId);
    cachedGoogle = { token: t.access_token, until: Date.now() + (t.expires_in ?? 3000) * 1000 - 60_000 };
    await record(provider, { scopes: d.scopes.filter((x) => !missing.includes(x)), missingScopes: missing, refresh: true });
    return { provider, message: `Google connected (YouTube, Analytics, Search Console and Google Ads scopes).${scopeNote}` };
  }
  // Meta: exchange for a long-lived user token, then list the Pages the user manages.
  const long = await getJson(`${d.tokenUrl()}?${new URLSearchParams({ grant_type: "fb_exchange_token", client_id: secretValue(d.clientId), client_secret: secretValue(d.clientSecret), fb_exchange_token: t.access_token })}`);
  const userToken = typeof long.body.access_token === "string" ? long.body.access_token : t.access_token;
  const longExpiry = typeof long.body.expires_in === "number" ? new Date(Date.now() + long.body.expires_in * 1000).toISOString() : expiresAt;
  await storeSecret("META_USER_ACCESS_TOKEN", "meta", userToken, userId);
  const pages = await metaPages(userToken);
  // Meta user tokens cannot be refreshed server-side: the stored expiry is how EXPIRED is detected (≈60 days).
  await record(provider, { pages: pages.map(({ id, name, instagram }) => ({ id, name, instagram })), expiresAt: longExpiry, refresh: false });
  const wanted = secretValue("META_PAGE_ID");
  const pick = pages.find((p) => p.id === wanted) ?? (pages.length === 1 ? pages[0] : null);
  if (pick) await selectMetaPage(pick.id, userId);
  return { provider, message: pages.length ? (pick ? `Meta connected; Page "${pick.name}" selected.` : `Meta connected. Choose which of your ${pages.length} Pages to use.`) : "Meta connected, but no Pages were granted. Reconnect and select a Page." };
}

async function metaPages(userToken: string) {
  const r = await getJson(`https://graph.facebook.com/${GRAPH()}/me/accounts?fields=id,name,access_token,instagram_business_account&limit=100&access_token=${encodeURIComponent(userToken)}`);
  const data = (r.body.data as { id: string; name: string; access_token: string; instagram_business_account?: { id: string } }[] | undefined) ?? [];
  return data.map((p) => ({ id: p.id, name: p.name, token: p.access_token, instagram: p.instagram_business_account?.id ?? null }));
}

/** Stores the chosen Page's token (and its Instagram business account) — tokens are fetched fresh, never from page state. */
export async function selectMetaPage(pageId: string, userId: string) {
  await hydrateVault(true);
  const userToken = secretValue("META_USER_ACCESS_TOKEN");
  if (!userToken) throw new OAuthError("Connect Meta first.");
  const page = (await metaPages(userToken)).find((p) => p.id === pageId);
  if (!page) throw new OAuthError("That Page is not available to the connected Meta account.");
  await storeSecret("META_PAGE_ID", "meta", page.id, userId);
  await storeSecret("META_PAGE_ACCESS_TOKEN", "meta", page.token, userId);
  if (page.instagram) await storeSecret("INSTAGRAM_BUSINESS_ACCOUNT_ID", "meta", page.instagram, userId);
  return page.name;
}

let cachedGoogle: { token: string; until: number } | null = null;

/** Short-lived Google access token from the stored refresh token (null when Google is not connected). */
export async function googleAccessToken(): Promise<string | null> {
  if (cachedGoogle && cachedGoogle.until > Date.now()) return cachedGoogle.token;
  await hydrateVault();
  const refresh = secretValue("GOOGLE_REFRESH_TOKEN");
  if (!refresh || !secretValue(OAUTH.google.clientId)) return null;
  try {
    const t = await tokenRequest(OAUTH.google, { grant_type: "refresh_token", refresh_token: refresh });
    cachedGoogle = { token: t.access_token, until: Date.now() + (t.expires_in ?? 3000) * 1000 - 60_000 };
    return t.access_token;
  } catch (e) {
    await refreshFailed("google", e as OAuthError, null);
    return null;
  }
}

/** A refresh that the provider refused: marks the sign-in EXPIRED (invalid_grant) or ERROR, and audits it. */
async function refreshFailed(provider: OAuthProvider, e: OAuthError, userId: string | null) {
  const expired = e.kind === "EXPIRED" || e.kind === "REJECTED";
  const row = await db.integration.findUnique({ where: { key: `oauth:${provider}` } }).catch(() => null);
  const config = { ...((row?.config ?? {}) as Record<string, unknown>), state: expired ? "EXPIRED" : "ERROR", refreshFailedAt: new Date().toISOString() };
  await db.integration.updateMany({ where: { key: `oauth:${provider}` }, data: { status: "ERROR", lastError: e.message.slice(0, 300), config: JSON.parse(JSON.stringify(config)) } }).catch(() => null);
  await audit({ userId, action: "integration.oauth.refresh_failed", entity: "Integration", entityId: provider, metadata: { kind: e.kind, detail: e.detail ?? null } });
}

/** Refreshes the X user token (X rotates refresh tokens, so both are stored again). */
export async function refreshXToken(userId: string | null = null): Promise<boolean> {
  await hydrateVault();
  const refresh = secretValue("X_REFRESH_TOKEN");
  if (!refresh) return false;
  try {
    const t = await tokenRequest(OAUTH.x, { grant_type: "refresh_token", refresh_token: refresh });
    await storeSecret("X_ACCESS_TOKEN", "x", t.access_token, userId ?? "system");
    if (t.refresh_token) await storeSecret("X_REFRESH_TOKEN", "x", t.refresh_token, userId ?? "system");
    await refreshed("x", t.expires_in);
    return true;
  } catch (e) {
    if (e instanceof OAuthError) await refreshFailed("x", e, userId);
    return false;
  }
}

/** Refreshes the LinkedIn access token when LinkedIn issued a refresh token (programmatic refresh is partner-enabled). */
export async function refreshLinkedInToken(userId: string | null = null): Promise<boolean> {
  await hydrateVault();
  const refresh = secretValue("LINKEDIN_REFRESH_TOKEN");
  if (!refresh) return false;
  try {
    const t = await tokenRequest(OAUTH.linkedin, { grant_type: "refresh_token", refresh_token: refresh });
    await storeSecret("LINKEDIN_ACCESS_TOKEN", "linkedin", t.access_token, userId ?? "system");
    if (t.refresh_token) await storeSecret("LINKEDIN_REFRESH_TOKEN", "linkedin", t.refresh_token, userId ?? "system");
    await refreshed("linkedin", t.expires_in);
    return true;
  } catch (e) {
    if (e instanceof OAuthError) await refreshFailed("linkedin", e, userId);
    return false;
  }
}

async function refreshed(provider: OAuthProvider, expiresIn?: number) {
  const row = await db.integration.findUnique({ where: { key: `oauth:${provider}` } }).catch(() => null);
  if (!row) return;
  const config = { ...((row.config ?? {}) as Record<string, unknown>), state: "CONNECTED", expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null, refreshedAt: new Date().toISOString() };
  await db.integration.update({ where: { key: row.key }, data: { status: "CONNECTED", lastError: null, config: JSON.parse(JSON.stringify(config)) } });
}

const REVOKE: Record<OAuthProvider, (tokens: Record<string, string>) => { url: string; init: RequestInit } | null> = {
  google: (t) => (t.GOOGLE_REFRESH_TOKEN ? { url: `https://oauth2.googleapis.com/revoke`, init: { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: t.GOOGLE_REFRESH_TOKEN }).toString() } } : null),
  x: (t) => (t.X_REFRESH_TOKEN || t.X_ACCESS_TOKEN ? { url: "https://api.x.com/2/oauth2/revoke", init: { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${Buffer.from(`${secretValue(OAUTH.x.clientId)}:${secretValue(OAUTH.x.clientSecret)}`).toString("base64")}` }, body: new URLSearchParams({ token: t.X_REFRESH_TOKEN || t.X_ACCESS_TOKEN, token_type_hint: t.X_REFRESH_TOKEN ? "refresh_token" : "access_token" }).toString() } } : null),
  linkedin: (t) => (t.LINKEDIN_ACCESS_TOKEN ? { url: "https://www.linkedin.com/oauth/v2/revoke", init: { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: secretValue(OAUTH.linkedin.clientId), client_secret: secretValue(OAUTH.linkedin.clientSecret), token: t.LINKEDIN_ACCESS_TOKEN }).toString() } } : null),
  meta: (t) => (t.META_USER_ACCESS_TOKEN ? { url: `https://graph.facebook.com/${GRAPH()}/me/permissions?access_token=${encodeURIComponent(t.META_USER_ACCESS_TOKEN)}`, init: { method: "DELETE" } } : null),
};

/**
 * Revokes the sign-in at the provider (best effort, before our copies are deleted). The caller always deletes the
 * stored tokens; the result says honestly whether the provider confirmed the revocation.
 */
export async function revokeOAuth(provider: OAuthProvider): Promise<{ revoked: boolean; message: string }> {
  await hydrateVault(true);
  const tokens = Object.fromEntries(OAUTH_TOKENS[provider].map((n) => [n, secretValue(n)]));
  const req = REVOKE[provider](tokens);
  if (!req) return { revoked: false, message: "No stored token to revoke." };
  try {
    const res = await trackedFetch(req.url, { ...req.init, signal: AbortSignal.timeout(15_000), cache: "no-store" });
    if (res.ok) return { revoked: true, message: `${OAUTH[provider].name}: access revoked at the provider.` };
    return { revoked: false, message: `${OAUTH[provider].name} did not confirm the revocation (HTTP ${res.status}); remove the app's access in the provider's account settings.` };
  } catch {
    return { revoked: false, message: `${OAUTH[provider].name} could not be reached to revoke access; remove the app's access in the provider's account settings.` };
  }
}

/** Provider OAuth status for the UI (never tokens). */
export async function oauthStatus() {
  if (!process.env.DATABASE_URL) return [];
  const rows = await db.integration.findMany({ where: { key: { startsWith: "oauth:" } } });
  return (Object.keys(OAUTH) as OAuthProvider[]).map((p) => {
    const r = rows.find((x) => x.key === `oauth:${p}`);
    const config = (r?.config ?? null) as Record<string, unknown> | null;
    const expiresAt = typeof config?.expiresAt === "string" ? config.expiresAt : null;
    const canRefresh = p === "google" ? !!secretValue("GOOGLE_REFRESH_TOKEN") : p === "x" ? !!secretValue("X_REFRESH_TOKEN") : p === "linkedin" ? !!secretValue("LINKEDIN_REFRESH_TOKEN") : false;
    const state = !r ? "NOT_CONNECTED" : config?.state === "EXPIRED" || tokenExpired(expiresAt, canRefresh) ? "EXPIRED" : r.status;
    return { provider: p, name: OAUTH[p].name, clientReady: !!(secretValue(OAUTH[p].clientId) && secretValue(OAUTH[p].clientSecret)), status: r?.status ?? "NOT_CONNECTED", state, expiresAt, canRefresh, missingScopes: Array.isArray(config?.missingScopes) ? (config!.missingScopes as string[]) : [], lastError: r?.lastError ?? null, config, connects: OAUTH[p].connects };
  });
}
