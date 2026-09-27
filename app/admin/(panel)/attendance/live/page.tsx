import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { audit } from "@/lib/audit";
import { requireAccess } from "@/lib/os/guard";
import { liveWorkforce, summarize } from "@/lib/workforce/attendance";
import { getWorkforcePolicy } from "@/lib/workforce/settings";
import { LOCATION_POLICIES } from "@/lib/workforce/policy";
import { fmtMinutes } from "@/lib/workforce/time";
import { DataTable, Kpi, KpiGrid, Section } from "@/components/admin/os";
import { PageHeader, Panel, fmtDate, label } from "@/components/admin/ui";
import { AutoRefresh } from "@/components/admin/ai/auto-refresh";
import { AttendanceBadge, GeofenceBadge, NoData, PersonCell } from "@/components/admin/workforce/ui";
import { GeofenceDiagram, offsetM } from "@/components/admin/workforce/geofence";

export const metadata = { title: "Live workforce" };

export default async function LiveWorkforcePage() {
  const user = await requireAccess("attendance:view");
  const loc = can(user.role, "attendance:location");
  const policy = await getWorkforcePolicy();
  const rows = (await liveWorkforce({})).filter((r) => r.checkInAt && !r.checkOutAt);
  const s = summarize(rows);
  const offices = loc ? await db.officeLocation.findMany({ where: { active: true, remote: false } }) : [];
  if (loc) await audit({ userId: user.id, action: "attendance.location.viewed", metadata: { employees: rows.filter((r) => r.lastLocationAt).length } });
  const since = (d: Date | null) => (d ? fmtMinutes(Math.round((Date.now() - d.getTime()) / 60_000)) + " ago" : "—");
  return (
    <>
      <AutoRefresh active every={30_000} />
      <PageHeader title="Live workforce" description={`Checked-in employees right now (refreshes every 30 s). Location policy: ${LOCATION_POLICIES[policy.locationPolicy]}.`} crumbs={[{ label: "Human Workforce" }, { label: "Attendance", href: "/admin/attendance" }, { label: "Live" }]} />
      <KpiGrid cols={5}>
        <Kpi label="Checked in" value={rows.length} />
        <Kpi label="Working" value={s.working} tone="green" />
        <Kpi label="On break" value={s.onBreak} />
        <Kpi label="Away" value={s.away} tone={s.away ? "amber" : undefined} />
        <Kpi label="Remote" value={s.remote} hint={`${s.office} in office`} />
      </KpiGrid>
      <Section title="On shift">
        {rows.length ? (
          <DataTable
            rows={rows}
            columns={[
              { header: "Employee", cell: (r) => <PersonCell name={r.name} src={r.photoUrl} sub={r.department ?? r.code} href={`/admin/employees/${r.id}`} /> },
              { header: "Status", cell: (r) => <AttendanceBadge state={r.state} /> },
              { header: "Mode", cell: (r) => label(r.dayWorkMode ?? r.workMode) },
              { header: "Checked in", cell: (r) => fmtDate(r.checkInAt, true) },
              { header: "Working", cell: (r) => fmtMinutes(r.workedMinutes) },
              { header: "Office", cell: (r) => (r.dayWorkMode === "REMOTE" ? "Remote" : r.office ?? "—") },
              ...(loc
                ? [
                    { header: "Geofence", cell: (r: (typeof rows)[number]) => <GeofenceBadge value={r.geofence} /> },
                    { header: "Last location", cell: (r: (typeof rows)[number]) => (r.lastLocationAt ? `${since(r.lastLocationAt)} · ±${r.lastLocationAccuracy ?? "?"} m` : "Not shared") },
                  ]
                : []),
              { header: "Last activity", cell: (r) => since(r.lastActivityAt) },
            ]}
          />
        ) : (
          <NoData>Nobody is checked in right now.</NoData>
        )}
      </Section>
      {loc && (
        <Section title="Office geofences">
          {offices.length ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {offices.map((o) => {
                const origin = { lat: Number(o.latitude), lng: Number(o.longitude) };
                const pts = rows.filter((r) => r.lastLat != null && r.dayWorkMode === "OFFICE").map((r) => ({ id: r.id, label: `${r.name} · ${since(r.lastLocationAt)}`, ...offsetM(origin, { lat: r.lastLat!, lng: r.lastLng! }), accuracyM: r.lastLocationAccuracy, inside: r.geofence === "INSIDE" })).filter((p) => Math.hypot(p.dx, p.dy) < o.radiusM * 20);
                return (
                  <Panel key={o.id} title={o.name}>
                    <GeofenceDiagram radiusM={o.radiusM} points={pts} />
                    <p className="mt-2 text-xs text-dim">{pts.length ? `${pts.length} employee(s) sharing periodic location near this office.` : "No one is sharing periodic location near this office."} Positions come only from employees who turned sharing on.</p>
                  </Panel>
                );
              })}
            </div>
          ) : (
            <NoData>No offices with a geofence. Add one under Settings → Offices.</NoData>
          )}
        </Section>
      )}
    </>
  );
}
