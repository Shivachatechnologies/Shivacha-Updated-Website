import { NextResponse, type NextRequest } from "next/server";
import { authorizeAccess } from "@/lib/os/guard";
import { audit } from "@/lib/audit";
import { isOAuthProvider, OAuthError, startOAuth } from "@/lib/integrations/oauth";

export const dynamic = "force-dynamic";

/** Starts a provider's OAuth consent flow for an integrations manager (redirects to the provider). */
export async function GET(req: NextRequest) {
  const back = (msg: string) => NextResponse.redirect(new URL(`/admin/integrations/connect?toast=${encodeURIComponent(msg)}`, req.url));
  let user;
  try {
    user = await authorizeAccess("integrations:manage", "INTEGRATIONS");
  } catch {
    return NextResponse.redirect(new URL("/admin/login", req.url));
  }
  const provider = req.nextUrl.searchParams.get("provider") ?? "";
  if (!isOAuthProvider(provider)) return back("Unknown provider.");
  try {
    const url = await startOAuth(provider, user.id);
    await audit({ userId: user.id, action: "integration.oauth.started", entity: "Integration", entityId: provider });
    return NextResponse.redirect(url);
  } catch (e) {
    return back(e instanceof OAuthError ? e.message : "Could not start the sign-in.");
  }
}
