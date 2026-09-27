import { db } from "@/lib/db/client";
import { can } from "@/lib/auth/permissions";
import { requireAccess } from "@/lib/os/guard";
import { saveOfficeAction } from "@/lib/workforce/employee-actions";
import { CheckField, DataTable, TextField } from "@/components/admin/os";
import { PageHeader, Panel } from "@/components/admin/ui";
import { ActionForm } from "@/components/admin/forms";
import { SubmitButton } from "@/components/admin/client";
import { NoData } from "@/components/admin/workforce/ui";
import { GeofenceDiagram } from "@/components/admin/workforce/geofence";

export const metadata = { title: "Offices" };

export default async function OfficesPage() {
  const user = await requireAccess("attendance:view");
  const manage = can(user.role, "attendance:manage");
  const offices = await db.officeLocation.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }], include: { _count: { select: { employees: true } } } });
  return (
    <>
      <PageHeader title="Office locations" description="Each office's geofence is used to check attendance location — only when the workforce policy collects location." crumbs={[{ label: "Settings", href: "/admin/settings" }, { label: "Offices" }]} />
      {offices.length ? (
        <DataTable
          rows={offices}
          columns={[
            { header: "Office", cell: (o) => <span className="font-medium">{o.name}</span> },
            { header: "Address", cell: (o) => <span className="text-muted">{o.address ?? "—"}</span> },
            { header: "Coordinates", cell: (o) => (o.remote ? "Remote (no geofence)" : `${Number(o.latitude).toFixed(5)}, ${Number(o.longitude).toFixed(5)}`) },
            { header: "Radius", cell: (o) => (o.remote ? "—" : `${o.radiusM} m`) },
            { header: "Time zone", cell: (o) => o.timezone },
            { header: "People", cell: (o) => o._count.employees },
            { header: "Status", cell: (o) => (o.active ? "Active" : "Inactive") },
            { header: "Geofence", cell: (o) => (o.remote ? "—" : <GeofenceDiagram radiusM={o.radiusM} points={[]} size={56} />) },
            ...(manage
              ? [{
                  header: "",
                  cell: (o: (typeof offices)[number]) => (
                    <details className="text-xs">
                      <summary className="cursor-pointer text-brand-blue">Edit</summary>
                      <ActionForm action={saveOfficeAction.bind(null, o.id)} className="mt-2 grid w-72 gap-2">
                        <TextField name="name" label="Name" defaultValue={o.name} required />
                        <TextField name="address" label="Address" defaultValue={o.address} />
                        <TextField name="latitude" label="Latitude" defaultValue={o.latitude?.toString()} />
                        <TextField name="longitude" label="Longitude" defaultValue={o.longitude?.toString()} />
                        <TextField name="radiusM" type="number" label="Radius (m)" defaultValue={o.radiusM} />
                        <TextField name="timezone" label="Time zone" defaultValue={o.timezone} />
                        <CheckField name="remote" label="Remote location" defaultChecked={o.remote} />
                        <CheckField name="active" label="Active" defaultChecked={o.active} />
                        <SubmitButton>Save</SubmitButton>
                      </ActionForm>
                    </details>
                  ),
                }]
              : []),
          ]}
        />
      ) : (
        <NoData>No offices yet.</NoData>
      )}
      {manage && (
        <Panel title="Add office" className="mt-4">
          <ActionForm action={saveOfficeAction.bind(null, null)} resetOnOk className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <TextField name="name" label="Name" required placeholder="Shivacha Gurgaon Office" className="lg:col-span-2" />
            <TextField name="address" label="Address" className="lg:col-span-2" />
            <TextField name="latitude" label="Latitude" placeholder="28.4595" />
            <TextField name="longitude" label="Longitude" placeholder="77.0266" />
            <TextField name="radiusM" type="number" label="Radius (m)" defaultValue={200} />
            <TextField name="timezone" label="Time zone" defaultValue="Asia/Kolkata" />
            <CheckField name="remote" label="Remote location (no geofence)" />
            <CheckField name="active" label="Active" defaultChecked />
            <div className="flex items-end"><SubmitButton>Add office</SubmitButton></div>
          </ActionForm>
          <p className="mt-2 text-xs text-dim">Copy exact coordinates from a map for the building entrance. Choose a radius that covers the building plus typical GPS error indoors (150–300 m).</p>
        </Panel>
      )}
    </>
  );
}
