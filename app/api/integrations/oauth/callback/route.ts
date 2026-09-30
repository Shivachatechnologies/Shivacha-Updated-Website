import { NextResponse, type NextRequest } from "next/server";
import { authorizeAccess } from "@/lib/os/guard";
import { audit } from "@/lib/audit";
import { completeOAuth, OAuthError } from "@/lib/integrations/oauth";
import { testIntegration } from "@/lib/integrations/health";
import { OAUTH } from "@/lib/integrations/oauth";

export const dynamic = "force-dynamic";

/**
 * OAuth redirect target. The one-time `state` must match a flow started by the same signed-in integrations manager;
 * the code is exchanged server-side and tokens go straight into the encrypted vault.
 */
export async function GET(req: NextRequest) {
  const back = (msg: string) => NextResponse.redirect(new URL(`/admin/integrations/connect?toast=${encodeURIComponent(msg)}`, req.url));
  let user;
  try {
    user = await authorizeAccess("integrations:manage", "INTEGRATIONS");
  } catch {
    return NextResponse.redirect(new URL("/admin/login", req.url));
  }
  const p = req.nextUrl.searchParams;
  const state = p.get("state") ?? "";
  const code = p.get("code") ?? "";
  if (p.get("error")) return back(`Sign-in was not completed: ${(p.get("error_description") ?? p.get("error") ?? "").slice(0, 150)}`);
  if (!state || !code) return back("Missing sign-in response.");
  try {
    const r = await completeOAuth(state, code, user.id);
    await audit({ userId: user.id, action: "integration.oauth.connected", entity: "Integration", entityId: r.provider });
    // Confirm with a real read-only call for each integration this sign-in connects.
    for (const key of OAUTH[r.provider].connects) await testIntegration(key).catch(() => null);
    return back(r.message);
  } catch (e) {
    await audit({ userId: user.id, action: "integration.oauth.failed", metadata: { reason: e instanceof OAuthError ? e.message : "error" } });
    return back(e instanceof OAuthError ? e.message : "Sign-in failed.");
  }
}
