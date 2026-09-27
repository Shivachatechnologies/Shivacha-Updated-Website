import { notFound, redirect } from "next/navigation";
import { can } from "@/lib/auth/permissions";
import { requireAccess } from "@/lib/os/guard";
import { resolveRange } from "@/lib/os/range";
import { reportByKey } from "@/lib/reports/definitions";
import { PageHeader, Panel, TableWrap, td, th } from "@/components/admin/ui";
import { RangePicker } from "@/components/admin/range";
import { KV, str, type SP } from "@/components/admin/os";

export const metadata = { title: "Report" };

export default async function ReportPage({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<SP> }) {
  const user = await requireAccess("reports:view");
  const def = reportByKey((await params).key);
  if (!def) notFound();
  if (!can(user.role, def.permission)) redirect(`/admin/forbidden?need=${encodeURIComponent(def.permission)}`);
  const sp = await searchParams;
  const range = resolveRange(str(sp, "range", 10) || "30d", str(sp, "from", 10), str(sp, "to", 10));
  const res = await def.run(range);
  const q = new URLSearchParams({ range: range.key, ...(str(sp, "from", 10) && { from: str(sp, "from", 10) }), ...(str(sp, "to", 10) && { to: str(sp, "to", 10) }) });
  const preview = res.rows.slice(0, 100);
  return (
    <>
      <PageHeader title={def.title} description={`${def.description}${def.rangeOn ? ` Period applies to: ${def.rangeOn}.` : " Point-in-time (today)."}`} crumbs={[{ label: "Reports", href: "/admin/reports" }, { label: def.title }]} actions={<><a href={`/admin/reports/${def.key}/export?${q}&format=csv`} className="btn-secondary h-9 px-3 text-[13px]">Export CSV</a><a href={`/admin/reports/${def.key}/export?${q}&format=pdf`} className="btn-secondary h-9 px-3 text-[13px]">Export PDF</a></>} />
      {def.rangeOn && <RangePicker active={range.key} basePath={`/admin/reports/${def.key}`} from={str(sp, "from", 10)} to={str(sp, "to", 10)} />}
      <Panel title={`Summary · ${def.rangeOn ? range.label : "today"}`}><KV cols={3} items={res.summary} /></Panel>
      <div className="mt-4">
        {preview.length === 0 ? <p className="text-sm text-muted">No records for this period.</p> : (
          <TableWrap>
            <thead><tr>{res.columns.map((c) => <th key={c} className={th}>{c}</th>)}</tr></thead>
            <tbody>{preview.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={`${td} whitespace-nowrap`}>{c ?? ""}</td>)}</tr>)}</tbody>
          </TableWrap>
        )}
        {res.rows.length > preview.length && <p className="mt-2 text-xs text-dim">Showing 100 of {res.rows.length.toLocaleString()} rows — export for the full report.</p>}
        {res.truncated && <p className="mt-1 text-xs text-amber-700">Report capped at 5,000 rows. Narrow the date range for complete exports.</p>}
      </div>
    </>
  );
}
