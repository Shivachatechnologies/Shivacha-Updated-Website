import type { Employee } from "@/lib/generated/prisma/client";
import { ActionForm, type FormResult } from "@/components/admin/forms";
import { SubmitButton } from "@/components/admin/client";
import { SelectField, TextField, enumOptions } from "@/components/admin/os";
import { toDateInput } from "@/lib/os/action";
import { EMPLOYMENT_STATUSES, EMPLOYMENT_TYPES, WEEKDAYS, WORK_MODES } from "@/lib/workforce/constants";

export interface EmployeeFormOptions {
  departments: { id: string; name: string }[];
  teams: { id: string; name: string }[];
  offices: { id: string; name: string }[];
  shifts: { id: string; name: string }[];
  managers: { id: string; fullName: string }[];
  logins: { id: string; name: string; email: string }[];
}

type Part = "identity" | "employment" | "organization";

/** One form for every employee field; `show` hides (but still submits) the parts that are not being edited. */
export function EmployeeForm({ action, employee, options, show = ["identity", "employment", "organization"], submit = "Save" }: { action: (s: FormResult, f: FormData) => Promise<FormResult>; employee?: Employee | null; options: EmployeeFormOptions; show?: Part[]; submit?: string }) {
  const e = employee;
  const days = e?.workingDays ?? [1, 2, 3, 4, 5];
  const section = (part: Part, title: string, children: React.ReactNode) => (
    <fieldset hidden={!show.includes(part)} className="rounded-lg border border-line bg-ink-900 p-4">
      <legend className="px-1 text-sm font-semibold text-fg">{title}</legend>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </fieldset>
  );
  return (
    <ActionForm action={action} className="space-y-5">
      {section(
        "identity",
        "Identity",
        <>
          <TextField name="fullName" label="Full name" required defaultValue={e?.fullName} maxLength={160} />
          <TextField name="photoUrl" label="Profile photo URL" defaultValue={e?.photoUrl} hint="https:// link to a real photo (optional)" />
          <SelectField name="gender" label="Gender" blank="Prefer not to say" options={[["Female", "Female"], ["Male", "Male"], ["Non-binary", "Non-binary"], ["Other", "Other"]]} defaultValue={e?.gender} />
          <TextField name="dateOfBirth" type="date" label="Date of birth" defaultValue={toDateInput(e?.dateOfBirth)} />
          <TextField name="workEmail" type="email" label="Work email" defaultValue={e?.workEmail} />
          <TextField name="personalEmail" type="email" label="Personal email" defaultValue={e?.personalEmail} />
          <TextField name="personalPhone" label="Personal phone" defaultValue={e?.personalPhone} />
          <TextField name="emergencyName" label="Emergency contact" defaultValue={e?.emergencyName} />
          <TextField name="emergencyPhone" label="Emergency phone" defaultValue={e?.emergencyPhone} />
          <TextField name="emergencyRelation" label="Relationship" defaultValue={e?.emergencyRelation} />
        </>,
      )}
      {section(
        "employment",
        "Employment",
        <>
          <TextField name="designation" label="Designation" defaultValue={e?.designation} />
          <TextField name="jobTitle" label="Job title" defaultValue={e?.jobTitle} />
          <SelectField name="employmentType" label="Employment type" options={enumOptions(EMPLOYMENT_TYPES)} defaultValue={e?.employmentType ?? "FULL_TIME"} />
          <SelectField name="status" label="Employment status" options={enumOptions(EMPLOYMENT_STATUSES)} defaultValue={e?.status ?? "ACTIVE"} />
          <TextField name="joiningDate" type="date" label="Joining date" defaultValue={toDateInput(e?.joiningDate)} />
          <TextField name="probationStart" type="date" label="Probation start" defaultValue={toDateInput(e?.probationStart)} />
          <TextField name="probationEnd" type="date" label="Probation end" defaultValue={toDateInput(e?.probationEnd)} />
          <TextField name="exitDate" type="date" label="Exit date" defaultValue={toDateInput(e?.exitDate)} />
          <SelectField name="userId" label="Login account" blank="No login" options={options.logins.map((u) => [u.id, `${u.name} (${u.email})`] as const)} defaultValue={e?.userId} hint="Links self-service, tasks and CRM ownership to this person." />
        </>,
      )}
      {section(
        "organization",
        "Organisation",
        <>
          <SelectField name="departmentId" label="Department" blank="—" options={options.departments.map((d) => [d.id, d.name] as const)} defaultValue={e?.departmentId} />
          <SelectField name="teamId" label="Team" blank="—" options={options.teams.map((d) => [d.id, d.name] as const)} defaultValue={e?.teamId} />
          <SelectField name="managerId" label="Reporting manager" blank="—" options={options.managers.filter((m) => m.id !== e?.id).map((d) => [d.id, d.fullName] as const)} defaultValue={e?.managerId} />
          <SelectField name="officeId" label="Office" blank="—" options={options.offices.map((d) => [d.id, d.name] as const)} defaultValue={e?.officeId} />
          <SelectField name="workMode" label="Work mode" options={enumOptions(WORK_MODES)} defaultValue={e?.workMode ?? "OFFICE"} />
          <SelectField name="shiftId" label="Shift" blank="No shift" options={options.shifts.map((d) => [d.id, d.name] as const)} defaultValue={e?.shiftId} />
          <TextField name="timezone" label="Time zone" defaultValue={e?.timezone} placeholder="Asia/Kolkata" hint="IANA name; defaults to the shift or office zone." />
          <div className="sm:col-span-2">
            <p className="mb-1 text-[12.5px] font-medium text-fg">Weekly working days <span className="font-normal text-dim">(used when no shift is set)</span></p>
            <div className="flex flex-wrap gap-3">
              {WEEKDAYS.map(([n, l]) => (
                <label key={n} className="flex items-center gap-1.5 text-sm text-fg">
                  <input type="checkbox" name="workingDays" value={n} defaultChecked={days.includes(n)} className="size-4" /> {l}
                </label>
              ))}
            </div>
          </div>
        </>,
      )}
      <div className="flex justify-end">
        <SubmitButton>{submit}</SubmitButton>
      </div>
    </ActionForm>
  );
}

