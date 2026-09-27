import { after, NextResponse, type NextRequest } from "next/server";
import { hasDatabase } from "@/lib/db/client";
import { rateLimited } from "@/lib/os/ratelimit";
import { isBotUserAgent } from "@/lib/os/ua";
import { trackingDecision } from "@/lib/visitors/policy";
import { getVisitorPolicy } from "@/lib/visitors/settings";
import { CONSENT_COOKIE, SESSION_COOKIE, SESSION_IDLE_MS, VISITOR_COOKIE, collectSchema, recordVisit } from "@/lib/visitors/collect";
import { clientIp, geoFromHeaders, sameOrigin } from "@/lib/visitors/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const secure = process.env.NODE_ENV === "production";

/**
 * First-party visitor collector. Same-origin only, rate-limited, bot-filtered, and it records nothing unless tracking
 * is enabled, the visitor has consented (when consent is required) and Global Privacy Control is not set.
 * Identifiers are random ids in HttpOnly first-party cookies; the IP address is never stored.
 */
export async function POST(req: NextRequest) {
  if (!sameOrigin(req.headers)) return new NextResponse(null, { status: 403 });
  const ip = clientIp(req.headers);
  if (rateLimited(`v:${ip ?? "unknown"}`, 120, 60_000)) return new NextResponse(null, { status: 429 });
  if (!hasDatabase()) return NextResponse.json({ tracked: false, reason: "no-database" });
  const raw = await req.text();
  if (raw.length > 8_000) return new NextResponse(null, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  const parsed = collectSchema.safeParse(body);
  if (!parsed.success) return new NextResponse(null, { status: 400 });

  const policy = await getVisitorPolicy();
  const ua = req.headers.get("user-agent") ?? "";
  const decision = trackingDecision(policy, { consent: req.cookies.get(CONSENT_COOKIE)?.value ?? null, gpc: req.headers.get("sec-gpc") === "1", bot: isBotUserAgent(ua), path: parsed.data.path });
  if (!decision.track) {
    const res = NextResponse.json({ tracked: false, reason: decision.reason });
    // A visitor who declined (or sends GPC) keeps no tracking identifiers.
    if (decision.reason === "declined" || decision.reason === "gpc") {
      res.cookies.delete(VISITOR_COOKIE);
      res.cookies.delete(SESSION_COOKIE);
    }
    return res;
  }

  try {
    const r = await recordVisit(parsed.data, { anonId: req.cookies.get(VISITOR_COOKIE)?.value ?? null, sessionKey: req.cookies.get(SESSION_COOKIE)?.value ?? null, userAgent: ua, ip, host: req.headers.get("x-forwarded-host") ?? req.headers.get("host"), geo: geoFromHeaders(req.headers) }, policy);
    after(r.background);
    const res = NextResponse.json({ tracked: true });
    res.cookies.set(VISITOR_COOKIE, r.anonId, { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: 365 * 86_400 });
    res.cookies.set(SESSION_COOKIE, r.sessionKey, { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: SESSION_IDLE_MS / 1000 });
    return res;
  } catch (e) {
    console.error("[visitors] collect failed", (e as Error).message);
    return NextResponse.json({ tracked: false, reason: "error" }, { status: 500 });
  }
}
