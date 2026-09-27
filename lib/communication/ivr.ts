import "server-only";
import { createHmac } from "node:crypto";
import { db } from "@/lib/db/client";
import { safeEqual } from "@/lib/payments/signature";

export const IVR_OPTIONS = { "1": "SALES", "2": "HR", "3": "GENERAL", "4": "EXISTING_CLIENT" } as const;
export type IvrOptionName = (typeof IVR_OPTIONS)[keyof typeof IVR_OPTIONS];

export interface IvrSettings {
  greeting: string;
  recording: boolean;
  SALES: string;
  HR: string;
  GENERAL: string;
  EXISTING_CLIENT: string;
}

export const DEFAULT_IVR: IvrSettings = {
  greeting: "Thank you for calling Shivacha Technologies. For sales, press 1. For careers and HR, press 2. For general enquiries, press 3. If you are an existing client, press 4.",
  recording: false,
  SALES: "",
  HR: "",
  GENERAL: "",
  EXISTING_CLIENT: "",
};

export async function ivrSettings(): Promise<IvrSettings> {
  const row = await db.setting.findUnique({ where: { key: "ivr" } }).catch(() => null);
  return { ...DEFAULT_IVR, ...((row?.value as Partial<IvrSettings>) ?? {}) };
}

/** Finds the lead or client behind a phone number (last 10 digits). */
export async function identifyCaller(phone: string | null) {
  const tail = (phone ?? "").replace(/\D/g, "").slice(-10);
  if (tail.length < 7) return { leadId: null, clientId: null, name: null };
  const [client] = await db.$queryRaw<{ id: string; name: string }[]>`
    SELECT c.id, c.name FROM "Client" c LEFT JOIN "ClientContact" cc ON cc."clientId" = c.id
    WHERE c."deletedAt" IS NULL AND (right(regexp_replace(coalesce(c.phone, ''), '\\D', '', 'g'), 10) = ${tail} OR right(regexp_replace(coalesce(cc.phone, ''), '\\D', '', 'g'), 10) = ${tail}) LIMIT 1`;
  const [lead] = await db.$queryRaw<{ id: string; name: string }[]>`
    SELECT id, name FROM "Lead" WHERE "archivedAt" IS NULL AND right(regexp_replace(coalesce(phone, ''), '\\D', '', 'g'), 10) = ${tail} ORDER BY "createdAt" DESC LIMIT 1`;
  return { leadId: lead?.id ?? null, clientId: client?.id ?? null, name: client?.name ?? lead?.name ?? null };
}

export const xml = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);
export const twiml = (inner: string) => new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`, { headers: { "Content-Type": "text/xml; charset=utf-8" } });

/** Twilio request validation: base64(HMAC-SHA1(authToken, url + sorted(key+value)…)). */
export function twilioSignatureValid(url: string, params: Record<string, string>, signature: string | null, authToken = process.env.TWILIO_AUTH_TOKEN) {
  if (!authToken || !signature) return false;
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join("");
  return safeEqual(createHmac("sha1", authToken).update(data, "utf8").digest("base64"), signature);
}

/** Reads a Twilio form POST and validates it against the public URL Twilio called. */
export async function readTwilio(req: Request) {
  const text = await req.text();
  const params = Object.fromEntries(new URLSearchParams(text));
  const u = new URL(req.url);
  const base = (process.env.TWILIO_WEBHOOK_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL || u.origin).replace(/\/$/, "");
  const valid = twilioSignatureValid(`${base}${u.pathname}${u.search}`, params, req.headers.get("x-twilio-signature"));
  return { params, valid };
}
