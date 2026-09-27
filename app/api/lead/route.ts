import { after, NextResponse, type NextRequest } from "next/server";
import {
  ALLOWED_UPLOAD_TYPES,
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_FILES,
  type LeadType,
  leadSchemas,
  validateLead,
} from "@/lib/validation";
import { emailDomainAcceptsMail } from "@/lib/leads/emailDomain";
import { buildLead, processLead } from "@/lib/leads/pipeline";
import { linkVisitorToLead, VISITOR_COOKIE } from "@/lib/visitors/collect";

export const runtime = "nodejs";

/**
 * Lead intake endpoint for all website forms.
 *
 * Pipeline: validate → save to the lead database → email sales@shivacha.com → confirm to the visitor
 * (confirmation and webhook run after the response). See lib/leads/pipeline.ts.
 *
 * Security measures:
 *  - Same-origin check via Origin / Sec-Fetch-Site / Referer (CSRF mitigation for a cookie-less endpoint)
 *  - Email syntax + mail-domain (MX) check, phone digit-count check
 *  - Honeypot field and minimum fill-time check (bot mitigation)
 *  - Per-IP and per-email rate limiting (in-memory; replace with Redis/Upstash in multi-instance deployments)
 *  - Server-side validation and sanitisation of every field
 *  - Upload type/size limits
 *  - Optional Cloudflare Turnstile verification (CAPTCHA readiness)
 *  - Secrets only read from server environment variables
 */

const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 8;
const hits = new Map<string, number[]>();

function limited(key: string, max: number) {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > max;
}

function sameOrigin(req: NextRequest) {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const origin = req.headers.get("origin");
  if (origin) {
    try {
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  }
  if (req.headers.get("sec-fetch-site") === "cross-site") return false;
  const referer = req.headers.get("referer");
  if (referer) {
    try {
      return new URL(referer).host === host;
    } catch {
      return false;
    }
  }
  return true; // non-browser clients; the other protections still apply
}

const regionNames = new Intl.DisplayNames(["en"], { type: "region" });
function countryFromHeaders(req: NextRequest) {
  const code = (req.headers.get("x-vercel-ip-country") || req.headers.get("cf-ipcountry") || req.headers.get("cloudfront-viewer-country") || "").toUpperCase();
  if (!/^[A-Z]{2}$/.test(code) || code === "XX") return "";
  try {
    return regionNames.of(code) ?? code;
  } catch {
    return code;
  }
}

async function verifyTurnstile(token: string | undefined, ip: string) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  if (!token) return false;
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: new URLSearchParams({ secret, response: token, remoteip: ip }),
    signal: AbortSignal.timeout(8000),
  }).catch(() => null);
  if (!res) return false;
  const data = (await res.json().catch(() => ({}))) as { success?: boolean };
  return data.success === true;
}

export async function POST(req: NextRequest) {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";

  if (!sameOrigin(req)) return NextResponse.json({ ok: false, error: "Invalid origin." }, { status: 403 });
  if (limited(`ip:${ip}`, MAX_PER_WINDOW)) return NextResponse.json({ ok: false, error: "Too many submissions. Please try again later." }, { status: 429 });

  let fields: Record<string, unknown> = {};
  const files: { name: string; type: string; size: number; data: string }[] = [];
  const contentType = req.headers.get("content-type") ?? "";

  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      let total = 0;
      for (const [key, value] of form.entries()) {
        if (typeof value === "string") fields[key] = value;
        else if (key === "documents" && value.size > 0) {
          if (files.length >= MAX_UPLOAD_FILES) return NextResponse.json({ ok: false, error: `Up to ${MAX_UPLOAD_FILES} files allowed.` }, { status: 400 });
          if (!ALLOWED_UPLOAD_TYPES.includes(value.type)) return NextResponse.json({ ok: false, error: `Unsupported file type: ${value.name}` }, { status: 400 });
          total += value.size;
          if (total > MAX_UPLOAD_BYTES) return NextResponse.json({ ok: false, error: "Files exceed the 10 MB limit." }, { status: 400 });
          files.push({ name: value.name.slice(0, 200), type: value.type, size: value.size, data: Buffer.from(await value.arrayBuffer()).toString("base64") });
        }
      }
    } else {
      fields = (await req.json()) as Record<string, unknown>;
    }
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  // Honeypot + fill-time checks: silently accept to avoid teaching bots.
  const startedAt = Number(fields._t ?? 0);
  if (fields.company_fax || (startedAt && Date.now() - startedAt < 2500)) return NextResponse.json({ ok: true });

  const type = String(fields.type ?? "") as LeadType;
  if (!(type in leadSchemas)) return NextResponse.json({ ok: false, error: "Unknown form." }, { status: 400 });

  if (!(await verifyTurnstile(fields["cf-turnstile-response"] as string | undefined, ip))) {
    return NextResponse.json({ ok: false, error: "Verification failed. Please retry." }, { status: 400 });
  }

  const { ok, errors, values } = validateLead(type, fields);
  if (!ok) return NextResponse.json({ ok: false, errors }, { status: 422 });
  if (values.email && !(await emailDomainAcceptsMail(values.email))) {
    return NextResponse.json({ ok: false, errors: { email: "This email domain cannot receive mail. Please check the address." } }, { status: 422 });
  }
  if (values.email && limited(`email:${values.email.toLowerCase()}`, 4)) {
    return NextResponse.json({ ok: false, error: "We already received several requests from this email. Our team will be in touch." }, { status: 429 });
  }

  const lead = buildLead(type, values, files, { country: countryFromHeaders(req), referer: req.headers.get("referer")?.slice(0, 300) ?? "", userAgent: req.headers.get("user-agent") ?? "" });
  const result = await processLead(lead);
  if (!result.accepted) {
    return NextResponse.json({ ok: false, error: "We could not submit your request right now. Please email sales@shivacha.com or message us on WhatsApp." }, { status: 502 });
  }
  // Visitor confirmation and CRM webhook finish after the response is sent.
  after(result.background);
  // Website activity → CRM: link this browser's first-party visitor record to the lead it just created.
  const visitorId = req.cookies.get(VISITOR_COOKIE)?.value;
  if (visitorId && result.crm.id && type !== "job") after(() => linkVisitorToLead(visitorId, result.crm.id!).then(() => undefined).catch((e) => console.error("[lead] visitor link failed", (e as Error).message)));
  console.info("[lead] accepted", { id: lead.id, type, stored: result.store.driver, crm: result.crm.stored, notified: result.notified, score: lead.score });
  return NextResponse.json({ ok: true, id: lead.id });
}

export function GET() {
  return NextResponse.json({ ok: false, error: "Method not allowed." }, { status: 405 });
}
