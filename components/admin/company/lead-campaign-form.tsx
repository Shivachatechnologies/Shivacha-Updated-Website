import { ActionForm } from "@/components/admin/forms";
import { SubmitButton } from "@/components/admin/client";
import { SelectField, TextArea, TextField } from "@/components/admin/os";
import type { ActionState } from "@/lib/os/action";
import { LEADGEN_SOURCES, type LeadGenConfig } from "@/lib/company/leadgen-rules";

interface Values {
  name?: string;
  market?: string | null;
  icp?: string | null;
  offer?: string | null;
  dailyLeadTarget?: number | null;
  regionKey?: string | null;
  cfg?: LeadGenConfig;
}

/** Lead campaign builder: market, ICP, offer, sources, daily/total target and execution mode. */
export function LeadCampaignForm({ action, modes, regions, v = {} }: { action: (s: ActionState, f: FormData) => Promise<ActionState>; modes: [string, string][]; regions: [string, string][]; v?: Values }) {
  const c = v.cfg;
  return (
    <ActionForm action={action} className="space-y-2.5">
      <TextField name="name" label="Campaign name" defaultValue={v.name ?? ""} placeholder="US fintech CTOs" />
      <div className="grid grid-cols-2 gap-2">
        <TextField name="market" label="Market" defaultValue={v.market ?? ""} placeholder="US fintech" />
        <SelectField name="regionKey" label="Region" blank="—" options={regions} defaultValue={v.regionKey ?? ""} />
      </div>
      <TextArea name="icp" label="ICP (description)" rows={2} defaultValue={v.icp ?? ""} />
      <TextArea name="offer" label="Offer" rows={2} defaultValue={v.offer ?? ""} />
      <TextField name="titles" label="Target job titles (comma separated)" defaultValue={c?.titles.join(", ") ?? ""} placeholder="CTO, Head of Engineering" />
      <TextField name="countries" label="Countries (comma separated)" defaultValue={c?.countries.join(", ") ?? ""} placeholder="United States" />
      <TextField name="industries" label="Industries (comma separated)" defaultValue={c?.industries.join(", ") ?? ""} placeholder="Fintech" />
      <TextArea name="domains" label="Company domains (optional, one per line)" rows={2} defaultValue={c?.domains.join("\n") ?? ""} />
      <fieldset>
        <legend className="mb-1 text-[12.5px] font-medium">Sources</legend>
        {Object.entries(LEADGEN_SOURCES).map(([k, l]) => (
          <label key={k} className="flex items-center gap-2 text-sm"><input type="checkbox" name="sources" value={k} defaultChecked={!c || c.sources.includes(k as never)} /> {l}</label>
        ))}
      </fieldset>
      <div className="grid grid-cols-3 gap-2">
        <TextField name="dailyLeadTarget" type="number" label="Daily target" defaultValue={v.dailyLeadTarget ?? 25} />
        <TextField name="totalTarget" type="number" label="Total target" defaultValue={c?.totalTarget ?? ""} />
        <TextField name="minFit" type="number" label="Min ICP fit" defaultValue={c?.minFit ?? 60} />
      </div>
      <SelectField name="mode" label="Execution mode" options={modes} defaultValue={c?.mode ?? "MANUAL"} />
      <SubmitButton>{v.name ? "Save campaign" : "Create campaign"}</SubmitButton>
      <p className="text-xs text-dim">Daily target caps discovery per day (provider credits). Targets are goals, never guarantees.</p>
    </ActionForm>
  );
}
