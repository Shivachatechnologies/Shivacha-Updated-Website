import { db } from "@/lib/db/client";
import type { Automation } from "@/lib/generated/prisma/client";
import { ROLES } from "@/lib/auth/permissions";
import { TRIGGERS, TRIGGER_INFO } from "@/lib/automation/rules";
import { AGENTS } from "@/lib/ai/catalog";
import { saveAutomationAction } from "@/lib/automation/actions";
import { SubmitButton } from "./client";
import { ActionForm } from "./forms";
import { CheckField, TextField } from "./os";
import { AutomationBuilder } from "./automation-builder";

export async function AutomationForm({ a }: { a?: Automation }) {
  const users = await db.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  return (
    <ActionForm action={saveAutomationAction.bind(null, a?.id ?? null)} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField name="name" label="Name" required defaultValue={a?.name} maxLength={200} />
        <TextField name="description" label="Description" defaultValue={a?.description} maxLength={1000} />
      </div>
      <AutomationBuilder
        triggers={TRIGGERS.map((t) => [t, TRIGGER_INFO[t].label])}
        fields={Object.fromEntries(TRIGGERS.map((t) => [t, TRIGGER_INFO[t].fields]))}
        initialTrigger={a?.trigger ?? "NEW_LEAD"}
        initialConditions={(a?.conditions as { field: string; op: string; value: string }[]) ?? []}
        initialActions={(a?.actions as (Record<string, string | number> & { type: string })[]) ?? []}
        users={users.map((u) => [u.id, u.name])}
        agents={AGENTS.map((g) => [g.slug, g.name])}
        roles={[...ROLES]}
      />
      <CheckField name="enabled" label="Enabled" defaultChecked={a?.enabled ?? false} hint="Disabled automations never run." />
      <SubmitButton>{a ? "Save automation" : "Create automation"}</SubmitButton>
    </ActionForm>
  );
}
