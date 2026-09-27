import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * RFC 6238 TOTP (SHA-1, 6 digits, 30 s) for optional admin two-factor authentication.
 * Secrets are stored AES-256-GCM encrypted with APP_ENCRYPTION_KEY; 2FA cannot be enabled without that key.
 */
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const STEP = 30;

export function base32Encode(buf: Buffer) {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of buf) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string) {
  const clean = s.replace(/=+$/, "").replace(/\s/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const c of clean) {
    const i = B32.indexOf(c);
    if (i < 0) throw new Error("Invalid base32");
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export const newTotpSecret = () => base32Encode(randomBytes(20));

export function totpAt(secret: string, step: number) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(step));
  const h = createHmac("sha1", base32Decode(secret)).update(msg).digest();
  const o = h[h.length - 1] & 15;
  const n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1_000_000).padStart(6, "0");
}

/** Returns the matched time step (±1 step drift), or null. Callers reject steps ≤ the last used one (replay). */
export function verifyTotp(secret: string, code: string, now = Date.now()): number | null {
  const c = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(c)) return null;
  const cur = Math.floor(now / 1000 / STEP);
  for (const s of [cur, cur - 1, cur + 1]) {
    const expected = Buffer.from(totpAt(secret, s));
    if (timingSafeEqual(expected, Buffer.from(c))) return s;
  }
  return null;
}

export const otpauthUri = (secret: string, account: string, issuer = "Shivacha OS") => `otpauth://totp/${encodeURIComponent(`${issuer}:${account}`)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=${STEP}`;

export const encryptionConfigured = () => (process.env.APP_ENCRYPTION_KEY ?? "").length >= 32;
const key = () => {
  if (!encryptionConfigured()) throw new Error("APP_ENCRYPTION_KEY is not configured (32+ characters).");
  return createHash("sha256").update(process.env.APP_ENCRYPTION_KEY!).digest();
};

export function encryptSecret(plain: string) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `v1.${iv.toString("base64url")}.${c.getAuthTag().toString("base64url")}.${enc.toString("base64url")}`;
}

export function decryptSecret(blob: string) {
  const [v, iv, tag, enc] = blob.split(".");
  if (v !== "v1" || !iv || !tag || !enc) throw new Error("Unknown secret format");
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(enc, "base64url")), d.final()]).toString("utf8");
}
