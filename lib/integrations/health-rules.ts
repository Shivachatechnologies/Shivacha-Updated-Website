/**
 * Provider health classification (pure). Turns what a provider actually answered into an honest, actionable state.
 * A state is never better than the evidence: no answer is never CONNECTED, and an unknown answer is ERROR.
 */

export type HealthState = "CONNECTED" | "NOT_CONNECTED" | "NOT_SUPPORTED" | "ERROR" | "EXPIRED" | "RATE_LIMITED";

export type FailureKind = "EXPIRED" | "INVALID_CREDENTIALS" | "PERMISSION_DENIED" | "RATE_LIMITED" | "QUOTA_EXHAUSTED" | "TIMEOUT" | "UNAVAILABLE" | "MALFORMED" | "NETWORK" | "UNKNOWN";

export interface Evidence {
  /** HTTP status the provider returned (0 = no response). */
  status?: number;
  /** The request was answered locally by the usage gate (cool-down or daily cap) — nothing was sent. */
  local?: boolean;
  timeout?: boolean;
  network?: boolean;
  /** 2xx but the body did not have the expected shape. */
  malformed?: boolean;
  /** Provider message, already scrubbed of secrets. */
  message?: string;
  /** The credential is an OAuth user token (401 then means the sign-in expired or was revoked). */
  oauth?: boolean;
}

export interface Failure {
  kind: FailureKind;
  state: HealthState;
  reason: string;
}

const EXPIRED_HINT = /expired|invalid_grant|revoked|session has been invalidated|error validating access token|code.?190\b|token.*(invalid|expired)/i;
const QUOTA_HINT = /quota|credits?|insufficient.?funds|out of (requests|credits)|plan limit|usage limit|payment required/i;
const PERMISSION_HINT = /permission|scope|not authori[sz]ed|forbidden|access denied|insufficient/i;

/** Classifies a failed call. Order matters: the most specific evidence wins. */
export function classifyFailure(e: Evidence, provider: string): Failure {
  const s = e.status ?? 0;
  const msg = e.message ?? "";
  if (e.local) return { kind: /daily API limit/i.test(msg) ? "QUOTA_EXHAUSTED" : "RATE_LIMITED", state: "RATE_LIMITED", reason: msg || `${provider} is rate limited; no request was sent.` };
  if (e.timeout) return { kind: "TIMEOUT", state: "ERROR", reason: `${provider} did not answer in time (timeout). Try again; if it persists the provider is degraded.` };
  if (e.network) return { kind: "NETWORK", state: "ERROR", reason: `${provider} could not be reached (network error).` };
  if (s === 429) return QUOTA_HINT.test(msg) ? { kind: "QUOTA_EXHAUSTED", state: "RATE_LIMITED", reason: `${provider} quota or credits exhausted. Top up or wait for the quota to reset.` } : { kind: "RATE_LIMITED", state: "RATE_LIMITED", reason: `${provider} rate limit reached. Calls resume automatically after the provider's cool-down.` };
  if (s === 402 || (s >= 400 && s < 500 && QUOTA_HINT.test(msg) && !EXPIRED_HINT.test(msg))) return { kind: "QUOTA_EXHAUSTED", state: "ERROR", reason: `${provider} quota or credits exhausted (HTTP ${s}). Top up the provider account.` };
  if (s === 401 || (s === 400 && EXPIRED_HINT.test(msg))) {
    if (e.oauth || EXPIRED_HINT.test(msg)) return { kind: "EXPIRED", state: "EXPIRED", reason: `${provider} sign-in expired or was revoked. Sign in again on the Integrations page.` };
    return { kind: "INVALID_CREDENTIALS", state: "ERROR", reason: `${provider} rejected the credentials (HTTP 401). Check the key or secret.` };
  }
  if (s === 403) return { kind: "PERMISSION_DENIED", state: "ERROR", reason: `${provider} denied permission (HTTP 403)${PERMISSION_HINT.test(msg) ? ` — ${msg.slice(0, 120)}` : ""}. The account or app lacks a required permission or product; grant it and sign in again.` };
  if (s >= 500) return { kind: "UNAVAILABLE", state: "ERROR", reason: `${provider} is unavailable (HTTP ${s}). This is on the provider's side; try again later.` };
  if (e.malformed) return { kind: "MALFORMED", state: "ERROR", reason: `${provider} answered with an unexpected response. Nothing was assumed from it.` };
  if (s >= 400) return { kind: "UNKNOWN", state: "ERROR", reason: `${provider} returned HTTP ${s}${msg ? `: ${msg.slice(0, 160)}` : ""}.` };
  return { kind: "UNKNOWN", state: "ERROR", reason: msg ? `${provider}: ${msg.slice(0, 160)}` : `${provider} check failed.` };
}

/** Pulls an HTTP status out of an adapter's error text ("… HTTP 401 …"), when the adapter only returns text. */
export function statusFromText(text: string): number | undefined {
  const m = text.match(/\bHTTP (\d{3})\b/) ?? text.match(/\b(401|403|429|402|5\d\d)\b/);
  return m ? Number(m[1]) : undefined;
}

/** Removes secret values and secret-looking strings from any text before it is stored or shown. */
export function scrubSecrets(text: string, secrets: string[] = []): string {
  let out = text;
  for (const s of secrets) if (s && s.length >= 6) out = out.split(s).join("[redacted]");
  return out
    .replace(/\b(sk-[A-Za-z0-9_-]{8,}|sk_live_[A-Za-z0-9]{8,}|gh[pousr]_[A-Za-z0-9]{8,}|xox[baprs]-[A-Za-z0-9-]{8,}|EAA[A-Za-z0-9]{20,}|ya29\.[A-Za-z0-9._-]{10,}|AIza[0-9A-Za-z_-]{20,}|GOCSPX-[A-Za-z0-9_-]{8,})/g, "[redacted]")
    .replace(/\b(access_token|refresh_token|client_secret|api_key|key|token|password)=([^&\s"']+)/gi, "$1=[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]{8,}=*/g, "Bearer [redacted]");
}

/** OAuth error codes (RFC 6749 §4.1.2.1) → the message a person can act on. Never echoes provider text. */
export function oauthCallbackError(code: string): string {
  switch (code) {
    case "access_denied":
    case "user_cancelled_login":
    case "user_cancelled_authorize":
      return "Authorization cancelled. Nothing was connected.";
    case "invalid_scope":
      return "Insufficient permission: the app is not approved for a requested permission at the provider.";
    case "unauthorized_client":
    case "invalid_client":
      return "The provider rejected the app (check the client ID and redirect URL registered at the provider).";
    case "temporarily_unavailable":
    case "server_error":
      return "Provider unavailable. Try again in a few minutes.";
    default:
      return "Sign-in was not completed at the provider. Try again.";
  }
}

/** Token-endpoint failure → actionable message (provider text is not shown; it is scrubbed into the audit log only). */
export function tokenError(provider: string, status: number, body: Record<string, unknown>): string {
  const code = String(body.error ?? "");
  if (status === 429) return `${provider}: rate limited. Wait a few minutes and sign in again.`;
  if (status >= 500) return `${provider}: provider unavailable. Try again later.`;
  if (code === "invalid_grant") return `${provider}: the authorization code expired or was already used. Sign in again.`;
  if (code === "invalid_client" || status === 401) return `${provider}: the app's client ID or secret was rejected. Check them on the Integrations page.`;
  if (code === "invalid_scope" || status === 403) return `${provider}: insufficient permission for the requested scopes.`;
  return `${provider} did not issue a token (HTTP ${status}${code ? `, ${code.replace(/[^a-z_]/gi, "").slice(0, 40)}` : ""}).`;
}

/** Scopes the app asked for but the provider did not grant (only when the provider reports granted scopes). */
export function missingScopes(requested: string[], granted: string | undefined, separator = " "): string[] {
  if (!granted) return [];
  const have = new Set(granted.split(/[\s,]+/).filter(Boolean));
  if (separator === "," || granted.includes(",")) for (const g of granted.split(",")) have.add(g.trim());
  return requested.filter((s) => !have.has(s));
}

/** EXPIRED when a stored expiry has passed and no refresh token can renew it. */
export function tokenExpired(expiresAt: string | null | undefined, canRefresh: boolean, now = Date.now()): boolean {
  if (!expiresAt || canRefresh) return false;
  const t = Date.parse(expiresAt);
  return Number.isFinite(t) && t <= now;
}
