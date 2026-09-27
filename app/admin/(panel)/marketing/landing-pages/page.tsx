import Link from "next/link";
import { db } from "@/lib/db/client";
import { requireAccess } from "@/lib/os/guard";
import { resolveRange } from "@/lib/os/range";
import { funnelBy } from "@/lib/marketing/attribution";
import { PageHeader, Panel, fmtDate } from "@/components/admin/ui";
import { RangePicker } from "@/components/admin/range";
import { StatusBadge, str, type SP } from "@/components/admin/os";
import { FunnelTable } from "@/components/admin/marketing/funnel-table";

export const metadata = { title: "Landing pages" };

export default async function LandingPages({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAccess("marketing:view", "MARKETING_ANALYTICS");
  const sp = await searchParams;
  const range = resolveRange(str(sp, "range", 10) || "90d", str(sp, "from", 10), str(sp, "to", 10));
  const [rows, pages] = await Promise.all([funnelBy("landing", range, 50), db.page.findMany({ orderBy: { updatedAt: "desc" }, take: 30, select: { id: true, slug: true, title: true, status: true, updatedAt: true } })]);
  return (
    <>
      <PageHeader title="Landing pages" description="Which pages visitors first landed on before becoming a lead, and how those leads converted." crumbs={[{ label: "Marketing", href: "/admin/marketing" }, { label: "Landing pages" }]} />
      <RangePicker active={range.key} basePath="/admin/marketing/landing-pages" from={str(sp, "from", 10)} to={str(sp, "to", 10)} />
      <FunnelTable rows={rows} keyLabel="Landing page" link={(k) => (k.startsWith("/") ? k : undefined)} />
      <Panel title="CMS pages" className="mt-6" action={<Link href="/admin/pages/new" className="text-xs font-medium text-brand-blue hover:underline">New page</Link>}>
        <ul className="divide-y divide-line text-sm">
          {pages.map((p) => <li key={p.id} className="flex items-center justify-between gap-2 py-2"><Link href={`/admin/pages/${p.id}`} className="font-medium hover:text-brand-blue">{p.title}</Link><span className="flex items-center gap-2 text-xs text-muted">/{p.slug} · {fmtDate(p.updatedAt)} <StatusBadge value={p.status} /></span></li>)}
          {pages.length === 0 && <li className="py-3 text-dim">No CMS pages yet. Built-in landing pages live under /lp/….</li>}
        </ul>
      </Panel>
    </>
  );
}
