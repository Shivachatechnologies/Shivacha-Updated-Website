import { NextResponse, type NextRequest } from "next/server";
import { authorizeAccess } from "@/lib/os/guard";
import { audit } from "@/lib/audit";
import { completeOAuth, OAuthError } from "@/lib/integrations/oauth";
import { testIntegration } from "@/lib/integrations/health";
import { OAUTH } from "@/lib/integrations/oauth";
import { oauthCallbackError } from "@/lib/integrations/health-rules";

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
  if (p.get("error")) {
    // The provider's own description is never echoed into the page; the RFC error code maps to an actionable message.
    const errCode = (p.get("error") ?? "").replace(/[^a-z_]/gi, "").slice(0, 40);
    await audit({ userId: user.id, action: "integration.oauth.failed", metadata: { kind: errCode === "access_denied" ? "CANCELLED" : "PROVIDER_ERROR", error: errCode } });
    return back(oauthCallbackError(errCode));
  }
  if (!state || !code) return back("Invalid state: the provider's response was incomplete. Start the sign-in again.");
  try {
    const r = await completeOAuth(state, code, user.id);
    await audit({ userId: user.id, action: "integration.oauth.connected", entity: "Integration", entityId: r.provider });
    // Confirm with a real read-only call for each integration this sign-in connects.
    for (const key of OAUTH[r.provider].connects) await testIntegration(key).catch(() => null);
    return back(r.message);
  } catch (e) {
    await audit({ userId: user.id, action: "integration.oauth.failed", metadata: e instanceof OAuthError ? { kind: e.kind, reason: e.message, detail: e.detail ?? null } : { kind: "ERROR" } });
    return back(e instanceof OAuthError ? e.message : "Sign-in failed.");
  }
}
