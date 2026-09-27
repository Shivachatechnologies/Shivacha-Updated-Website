import { NextResponse, type NextRequest } from "next/server";
import { findRedirect, recordRedirectHit } from "@/lib/cms/redirects";

const PUBLIC_ADMIN = ["/admin/login", "/admin/forgot-password", "/admin/reset-password"];
const COOKIE = process.env.NODE_ENV === "production" ? "__Host-shv_admin" : "shv_admin";
const PUBLIC_PORTAL = ["/client/login", "/client/forgot-password", "/client/set-password"];
const PORTAL_COOKIE = process.env.NODE_ENV === "production" ? "__Host-shv_client" : "shv_client";

/**
 * 1. /admin: optimistic check for the session cookie (the session itself is validated server-side on every
 *    admin page, server action and route handler) and noindex headers.
 * 2. Public paths: CMS-managed redirects.
 */
export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // Employee self-service shares the staff session cookie.
  if (pathname === "/employee" || pathname.startsWith("/employee/")) {
    if (!req.cookies.get(COOKIE)?.value) {
      const url = req.nextUrl.clone();
      url.pathname = "/admin/login";
      url.search = `?next=${encodeURIComponent(pathname + search)}`;
      return NextResponse.redirect(url);
    }
    const res = NextResponse.next();
    res.headers.set("X-Robots-Tag", "noindex, nofollow");
    res.headers.set("Cache-Control", "no-store");
    return res;
  }

  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    const isPublic = PUBLIC_ADMIN.some((p) => pathname === p || pathname.startsWith(`${p}/`));
    if (!isPublic && !req.cookies.get(COOKIE)?.value) {
      const url = req.nextUrl.clone();
      url.pathname = "/admin/login";
      url.search = pathname === "/admin" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
      return NextResponse.redirect(url);
    }
    const res = NextResponse.next();
    res.headers.set("X-Robots-Tag", "noindex, nofollow");
    res.headers.set("Cache-Control", "no-store");
    return res;
  }

  // Client portal: optimistic cookie check (sessions and tenant ownership are validated server-side on every request).
  if (pathname === "/client" || pathname.startsWith("/client/")) {
    const isPublic = PUBLIC_PORTAL.some((p) => pathname === p || pathname.startsWith(`${p}/`));
    if (!isPublic && !req.cookies.get(PORTAL_COOKIE)?.value) {
      const url = req.nextUrl.clone();
      url.pathname = "/client/login";
      url.search = "";
      return NextResponse.redirect(url);
    }
    const res = NextResponse.next();
    res.headers.set("X-Robots-Tag", "noindex, nofollow");
    res.headers.set("Cache-Control", "no-store");
    return res;
  }

  // Secret proposal links: never indexed, never cached.
  if (pathname.startsWith("/p/")) {
    const res = NextResponse.next();
    res.headers.set("X-Robots-Tag", "noindex, nofollow");
    res.headers.set("Cache-Control", "no-store");
    res.headers.set("Referrer-Policy", "no-referrer");
    return res;
  }

  const rule = await findRedirect(pathname);
  if (rule) {
    recordRedirectHit(rule.id);
    const dest = /^https?:\/\//.test(rule.destination) ? rule.destination : new URL(rule.destination, req.url).toString();
    return NextResponse.redirect(dest, rule.statusCode === 302 || rule.statusCode === 307 ? rule.statusCode : 308);
  }
  return NextResponse.next();
}

export const config = {
  // Skip Next internals, API routes and static files.
  matcher: ["/((?!_next/|api/|favicon|icon|apple-icon|opengraph-image|robots.txt|sitemap.xml|llms.txt|search-index.json|brand/|graphics/|uploads/|.*\\.[a-z0-9]{2,5}$).*)"],
};
