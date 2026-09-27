import { db } from "@/lib/db/client";
import { requireAccess } from "@/lib/os/guard";
import { DataTable, pick, type SP } from "@/components/admin/os";
import { PageHeader, Panel } from "@/components/admin/ui";
import { BarList } from "@/components/admin/charts";
import { RangeLinks } from "@/components/admin/visitors/range";

export const metadata = { title: "Visitor geography" };

export default async function VisitorGeoPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAccess("visitors:view");
  const days = Number(pick(await searchParams, "days", ["7", "30", "90"] as const) ?? 30);
  const since = new Date(new Date().getTime() - days * 86_400_000);
  const where = { startedAt: { gte: since }, visitor: { isBot: false } };
  const [countries, cities, high] = await Promise.all([
    db.visitorSession.groupBy({ by: ["country"], where, _count: true, orderBy: { _count: { country: "desc" } }, take: 30 }),
    db.visitorSession.groupBy({ by: ["country", "city"], where: { ...where, city: { not: null } }, _count: true, orderBy: { _count: { city: "desc" } }, take: 30 }),
    db.visitor.groupBy({ by: ["country"], where: { isBot: false, intentLabel: "HIGH", lastSeenAt: { gte: since } }, _count: true, orderBy: { _count: { country: "desc" } }, take: 15 }),
  ]);
  return (
    <>
      <PageHeader title="Visitor geography" description="Approximate location from the hosting provider's IP geolocation (country and city level). Sessions, not people." crumbs={[{ label: "Visitors", href: "/admin/visitors" }, { label: "Geography" }]} actions={<RangeLinks base="/admin/visitors/geo" days={days} />} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={`Sessions by country (${days} days)`}>
          <BarList data={countries.map((c) => ({ label: c.country ?? "Unknown", value: c._count }))} empty="No sessions in this period." />
        </Panel>
        <Panel title="High-intent visitors by country">
          <BarList data={high.map((c) => ({ label: c.country ?? "Unknown", value: c._count }))} empty="No high-intent visitors in this period." />
        </Panel>
      </div>
      <Panel title="Top cities" className="mt-4">
        {cities.length ? <DataTable rows={cities.map((c, i) => ({ ...c, id: String(i) }))} columns={[{ header: "City", cell: (c) => c.city }, { header: "Country", cell: (c) => c.country ?? "—" }, { header: "Sessions", cell: (c) => c._count }]} /> : <p className="text-sm text-muted">No city data (city capture may be off, or no sessions yet).</p>}
      </Panel>
    </>
  );
}
