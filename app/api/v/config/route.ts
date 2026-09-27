import { NextResponse } from "next/server";
import { hasDatabase } from "@/lib/db/client";
import { getVisitorPolicy } from "@/lib/visitors/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public, non-sensitive tracker configuration: whether tracking is on and whether a consent banner is needed. */
export async function GET() {
  if (!hasDatabase()) return NextResponse.json({ enabled: false, consentRequired: true });
  const p = await getVisitorPolicy();
  return NextResponse.json({ enabled: p.enabled, consentRequired: p.consentMode === "REQUIRED", honorGpc: p.honorGpc }, { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } });
}
