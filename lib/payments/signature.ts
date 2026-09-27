import { createHmac, timingSafeEqual } from "node:crypto";

export const hmacHex = (algo: "sha256" | "sha1", secret: string, data: string) => createHmac(algo, secret).update(data, "utf8").digest("hex");

export function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Stripe: "t=timestamp,v1=signature[,v1=…]" over `${t}.${body}`, 5-minute tolerance. */
export function verifyStripeSignature(body: string, header: string | null, secret: string, now = Date.now(), toleranceSec = 300) {
  if (!header) return false;
  const parts = Object.groupBy(header.split(",").map((p) => p.split("=") as [string, string]), ([k]) => k);
  const t = parts.t?.[0]?.[1];
  const sigs = (parts.v1 ?? []).map(([, v]) => v);
  if (!t || !sigs.length || !/^\d+$/.test(t)) return false;
  if (Math.abs(now / 1000 - Number(t)) > toleranceSec) return false;
  const expected = hmacHex("sha256", secret, `${t}.${body}`);
  return sigs.some((s) => safeEqual(s, expected));
}

/** Razorpay: hex HMAC-SHA256 of the raw body in X-Razorpay-Signature. */
export const verifyRazorpaySignature = (body: string, header: string | null, secret: string) => !!header && safeEqual(header, hmacHex("sha256", secret, body));
