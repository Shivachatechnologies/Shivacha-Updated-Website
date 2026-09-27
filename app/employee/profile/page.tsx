import { requireSelf } from "@/lib/workforce/portal";
import { updateMyContactAction } from "@/lib/workforce/work-actions";
import { KV, TextField } from "@/components/admin/os";
import { Panel, fmtDate, label } from "@/components/admin/ui";
import { ActionForm } from "@/components/admin/forms";
import { SubmitButton } from "@/components/admin/client";

export const metadata = { title: "Profile" };

export default async function MyProfilePage() {
  const { user, me } = await requireSelf();
  if (!me) return null;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Employment (managed by HR)">
        <KV
          cols={1}
          items={[
            ["Employee ID", me.employeeCode],
            ["Name", me.fullName],
            ["Work email", me.workEmail ?? user.email],
            ["Designation", me.designation ?? me.jobTitle],
            ["Department", me.department?.name],
            ["Team", me.team?.name],
            ["Manager", me.manager?.fullName],
            ["Employment", `${label(me.employmentType)} · ${label(me.status)}`],
            ["Joined", fmtDate(me.joiningDate)],
            ["Work mode", label(me.workMode)],
            ["Office", me.office?.name],
            ["Shift", me.shift ? `${me.shift.name} (${me.shift.startTime}–${me.shift.endTime})` : null],
          ]}
        />
        <p className="mt-3 text-xs text-dim">To correct any of these, contact HR.</p>
      </Panel>
      <Panel title="My contact details">
        <ActionForm action={updateMyContactAction} className="grid gap-3">
          <TextField name="personalPhone" label="Personal phone" defaultValue={me.personalPhone} />
          <TextField name="emergencyName" label="Emergency contact name" defaultValue={me.emergencyName} />
          <TextField name="emergencyPhone" label="Emergency contact phone" defaultValue={me.emergencyPhone} />
          <TextField name="emergencyRelation" label="Relationship" defaultValue={me.emergencyRelation} />
          <div><SubmitButton>Save</SubmitButton></div>
        </ActionForm>
      </Panel>
    </div>
  );
}
