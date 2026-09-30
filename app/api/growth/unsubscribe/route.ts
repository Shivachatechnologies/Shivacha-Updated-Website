import { verifyUnsubscribeToken } from "@/lib/growth/email-rules";
import { suppress } from "@/lib/growth/email";
import { unsubscribeSecret } from "@/lib/growth/providers";
import { rateLimited } from "@/lib/os/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Unsubscribe link in every growth email. The token is an HMAC of the address, so links cannot be forged or used to
 * probe for addresses. GET shows a confirmation button (link scanners never unsubscribe anyone); POST unsubscribes
 * (also used by one-click List-Unsubscribe clients).
 */
const page = (title: string, body: string, status = 200) =>
  new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title><style>body{font-family:system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1rem;color:#111;background:#fff}@media(prefers-color-scheme:dark){body{background:#0b0d12;color:#e7e9ee}}button{font:inherit;padding:.6rem 1.1rem;border-radius:.5rem;border:0;background:#2563eb;color:#fff;cursor:pointer}</style></head><body><h1 style="font-size:1.4rem">${title}</h1>${body}</body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } },
  );

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function emailFrom(req: Request) {
  const t = new URL(req.url).searchParams.get("t") ?? "";
  const secret = unsubscribeSecret();
  return secret && t.length < 600 ? verifyUnsubscribeToken(t, secret) : null;
}

export async function GET(req: Request) {
  const email = emailFrom(req);
  if (!email) return page("Link not valid", "<p>This unsubscribe link is invalid or has expired. Reply to the email with “unsubscribe” and we will remove you.</p>", 400);
  const t = new URL(req.url).searchParams.get("t")!;
  return page("Unsubscribe", `<p>Stop marketing emails from Shivacha to <strong>${esc(email)}</strong>?</p><form method="post" action="?t=${encodeURIComponent(t)}"><button type="submit">Unsubscribe</button></form>`);
}

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (rateLimited(`unsub:${ip}`, 30, 3600_000)) return page("Too many requests", "<p>Please try again later.</p>", 429);
  const email = emailFrom(req);
  if (!email) return page("Link not valid", "<p>This unsubscribe link is invalid.</p>", 400);
  if (!process.env.DATABASE_URL) return page("Unavailable", "<p>Please reply to the email with “unsubscribe”.</p>", 503);
  await suppress(email, "UNSUBSCRIBE", "Unsubscribe link");
  return page("You are unsubscribed", `<p>${esc(email)} will not receive further marketing emails from Shivacha.</p>`);
}
