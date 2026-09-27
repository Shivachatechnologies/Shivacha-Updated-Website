import { authorize, AuthError } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { audit } from "@/lib/audit";
import { toCsvRow } from "@/lib/admin/csv";
import { renderPdf, pdfResponse } from "@/lib/os/pdf";
import { resolveRange } from "@/lib/os/range";
import { reportByKey } from "@/lib/reports/definitions";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const def = reportByKey((await params).key);
  if (!def) return new Response("Not found", { status: 404 });
  let user;
  try {
    user = await authorize("reports:view");
  } catch (e) {
    return new Response(e instanceof AuthError ? e.message : "Forbidden", { status: e instanceof AuthError && e.code === "UNAUTHENTICATED" ? 401 : 403 });
  }
  if (!can(user.role, def.permission)) return new Response("Forbidden", { status: 403 });
  const sp = new URL(req.url).searchParams;
  const range = resolveRange(sp.get("range") ?? "30d", sp.get("from") ?? undefined, sp.get("to") ?? undefined);
  const format = sp.get("format") === "pdf" ? "pdf" : "csv";
  const res = await def.run(range);
  await audit({ userId: user.id, action: "report.exported", entity: "Report", entityId: def.key, metadata: { format, range: range.label, rows: res.rows.length } });
  const stamp = new Date().toISOString().slice(0, 10);
  if (format === "csv") {
    const body = "﻿" + toCsvRow(res.columns) + res.rows.map((r) => toCsvRow(r)).join("");
    return new Response(body, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="shivacha-${def.key}-${stamp}.csv"`, "Cache-Control": "no-store" } });
  }
  const PDF_ROWS = 300;
  const bytes = await renderPdf({
    kind: "REPORT",
    number: stamp,
    title: def.title,
    meta: [["Period", def.rangeOn ? range.label : "Today"], ["Generated", new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC"], ["By", user.name]],
    sections: [
      { heading: "Summary", table: { head: ["Metric", "Value"], rows: res.summary.map(([k, v]) => [k, v]), widths: [0.4, 0.6] } },
      { heading: `Detail${res.rows.length > PDF_ROWS ? ` (first ${PDF_ROWS} of ${res.rows.length} rows — use CSV for all)` : ""}`, table: { head: res.columns, rows: res.rows.slice(0, PDF_ROWS).map((r) => r.map((c) => String(c ?? ""))) } },
    ],
    footerNote: "Generated from live Shivacha OS records. Amounts are per currency and not converted.",
  });
  return pdfResponse(bytes, `shivacha-${def.key}-${stamp}.pdf`, false);
}
