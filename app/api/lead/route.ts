import { NextResponse, type NextRequest } from "next/server";
import { createHmac } from "node:crypto";
import {
  ALLOWED_UPLOAD_TYPES,
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_FILES,
  type LeadType,
  leadSchemas,
  validateLead,
} from "@/lib/validation";

export const runtime = "nodejs";

/**
 * Lead intake endpoint for all website forms.
 *
 * Security measures:
 *  - Same-origin check (CSRF mitigation for a cookie-less JSON/multipart endpoint)
 *  - Honeypot field and minimum fill-time check (bot mitigation)
 *  - Per-IP rate limiting (in-memory; replace with Redis/Upstash in multi-instance deployments)
 *  - Server-side validation and sanitisation of every field
 *  - Upload type/size limits
 *  - Optional Cloudflare Turnstile verification (CAPTCHA readiness)
 *  - Secrets only read from server environment variables
 */

const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 8;
const hits = new Map<string, number[]>();

function rateLimited(ip: string) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > MAX_PER_WINDOW;
}

function sameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin) return true; // non-browser clients; other protections still apply
  try {
    return new URL(origin).host === req.headers.get("host");
  } catch {
    return false;
  }
}

async function verifyTurnstile(token: string | undefined, ip: string) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  if (!token) return false;
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: new URLSearchParams({ secret, response: token, remoteip: ip }),
  });
  const data = (await res.json().catch(() => ({}))) as { success?: boolean };
  return data.success === true;
}

export async function POST(req: NextRequest) {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";

  if (!sameOrigin(req)) return NextResponse.json({ ok: false, error: "Invalid origin." }, { status: 403 });
  if (rateLimited(ip)) return NextResponse.json({ ok: false, error: "Too many submissions. Please try again later." }, { status: 429 });

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

  const payload = {
    type,
    submittedAt: new Date().toISOString(),
    fields: values,
    files,
    meta: { userAgent: req.headers.get("user-agent")?.slice(0, 300), referer: req.headers.get("referer")?.slice(0, 300) },
  };

  const webhook = process.env.CRM_WEBHOOK_URL;
  if (webhook) {
    const body = JSON.stringify(payload);
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (process.env.CRM_WEBHOOK_SECRET) headers["x-shivacha-signature"] = createHmac("sha256", process.env.CRM_WEBHOOK_SECRET).update(body).digest("hex");
    try {
      const res = await fetch(webhook, { method: "POST", headers, body });
      if (!res.ok) throw new Error(`Webhook responded ${res.status}`);
    } catch (e) {
      console.error("[lead] delivery failed", (e as Error).message);
      return NextResponse.json({ ok: false, error: "We could not submit your request. Please email contact@shivacha.com." }, { status: 502 });
    }
  } else {
    // No CRM configured (e.g. local development). Log a redacted summary only.
    console.info("[lead] received", { type, fields: Object.keys(values), files: files.length });
  }

  return NextResponse.json({ ok: true });
}

export function GET() {
  return NextResponse.json({ ok: false, error: "Method not allowed." }, { status: 405 });
}
