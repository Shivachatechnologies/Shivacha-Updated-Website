import { db } from "@/lib/db/client";
import { authorize, AuthError } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { leadWhere, type LeadFilters } from "@/lib/admin/leads";
import { toCsvRow } from "@/lib/admin/csv";

export const dynamic = "force-dynamic";

const COLUMNS = ["ref", "createdAt", "name", "email", "phone", "company", "country", "service", "product", "budget", "status", "priority", "score", "scoreLabel", "assignedTo", "source", "campaign", "utmSource", "utmMedium", "utmCampaign", "landingPage", "lastContactedAt", "nextFollowUpAt", "estimatedValue", "message"] as const;

/** Streams the filtered lead list as CSV in batches (safe for 10k+ rows). */
export async function GET(req: Request) {
  let user;
  try {
    user = await authorize("leads:export");
  } catch (e) {
    return new Response(e instanceof AuthError ? e.message : "Forbidden", { status: e instanceof AuthError && e.code === "UNAUTHENTICATED" ? 401 : 403 });
  }
  const params = Object.fromEntries(new URL(req.url).searchParams) as LeadFilters;
  const where = leadWhere(params);
  const total = await db.lead.count({ where });
  await audit({ userId: user.id, action: "lead.exported", entity: "Lead", metadata: { count: total, filters: { ...params, page: undefined } } });

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(enc.encode("﻿" + toCsvRow([...COLUMNS])));
      let cursor: string | undefined;
      try {
        for (;;) {
          const batch = await db.lead.findMany({ where, orderBy: { id: "asc" }, take: 1000, ...(cursor && { skip: 1, cursor: { id: cursor } }), include: { assignedTo: { select: { name: true } } } });
          if (!batch.length) break;
          controller.enqueue(enc.encode(batch.map((l) => toCsvRow(COLUMNS.map((c) => (c === "assignedTo" ? l.assignedTo?.name : (l as Record<string, unknown>)[c])))).join("")));
          cursor = batch[batch.length - 1].id;
        }
      } catch (e) {
        console.error("[admin] export failed", (e as Error).message);
      }
      controller.close();
    },
  });
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(stream, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="shivacha-leads-${stamp}.csv"`, "Cache-Control": "no-store" } });
}
