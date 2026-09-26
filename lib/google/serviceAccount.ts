import { createSign } from "node:crypto";

/**
 * Minimal Google service-account OAuth (JWT bearer flow) without extra dependencies.
 * Credentials come only from server environment variables:
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY (PEM, "\n" escapes allowed)
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const cache = new Map<string, { token: string; exp: number }>();

export function serviceAccountConfigured() {
  return !!(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY);
}

const b64url = (input: Buffer | string) => Buffer.from(input).toString("base64url");

export function signJwt(claims: Record<string, unknown>, privateKey: string) {
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(claims));
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${body}`);
  return `${header}.${body}.${b64url(signer.sign(privateKey))}`;
}

export async function getAccessToken(scopes: string[]) {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!email || !key) throw new Error("Google service account is not configured");
  const scope = scopes.join(" ");
  const hit = cache.get(scope);
  if (hit && hit.exp > Date.now() + 60_000) return hit.token;

  const now = Math.floor(Date.now() / 1000);
  const assertion = signJwt({ iss: email, scope, aud: TOKEN_URL, iat: now, exp: now + 3600 }, key);
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
    signal: AbortSignal.timeout(10_000),
  });
  const data = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string };
  if (!res.ok || !data.access_token) throw new Error(`Google token request failed (${res.status} ${data.error ?? ""})`);
  cache.set(scope, { token: data.access_token, exp: Date.now() + (data.expires_in ?? 3600) * 1000 });
  return data.access_token;
}
