import { db } from "@/lib/db/client";
import { can } from "@/lib/auth/permissions";
import { requireAccess } from "@/lib/os/guard";
import { AGENTS } from "@/lib/ai/catalog";
import { BUDGET_KEYS, BUDGET_KINDS, CHANNEL_KEYS, GROWTH_CHANNELS, KILL_KEYS, KILL_SWITCHES, LANGUAGES, PLATFORM_LABELS, SOCIAL_PLATFORMS } from "@/lib/growth/policy";
import { getGrowthSettings } from "@/lib/growth/settings";
import { usageOf } from "@/lib/growth/engine";
import { providerStatuses } from "@/lib/growth/providers";
import { GROWTH_ROLES } from "@/lib/growth/workforce-map";
import { runGrowthLoopNowAction, saveGrowthControlAction, toggleKillSwitchAction } from "@/lib/growth/actions";
import { CheckField, DataTable, SelectField, StatusBadge, TextArea, TextField } from "@/components/admin/os";
import { Badge, PageHeader, Panel, fmtDate } from "@/components/admin/ui";
import { ActionForm } from "@/components/admin/forms";
import { SubmitButton } from "@/components/admin/client";
import { GROWTH_CRUMB, GrowthTabs } from "@/components/admin/growth/tabs";

export const metadata = { title: "Autonomous growth control" };
export const dynamic = "force-dynamic";

export default async function AutonomousPage() {
  const user = await requireAccess("growth:view", "GROWTH");
  const control = can(user.role, "growth:control");
  const manage = can(user.role, "growth:manage");
  const [s, runs, usage] = await Promise.all([
    getGrowthSettings(),
    db.growthRun.findMany({ orderBy: { startedAt: "desc" }, take: 10 }),
    Promise.all(BUDGET_KEYS.map(async (k) => [k, await usageOf(k)] as const)),
  ]);
  const used = Object.fromEntries(usage) as Record<(typeof BUDGET_KEYS)[number], number>;
  const providers = providerStatuses();
  const anyStop = KILL_KEYS.some((k) => s.stops[k]);
  return (
    <>
      <PageHeader title="Autonomous growth control" description="AUTONOMOUS_GROWTH_MODE, channel switches, kill switches and budgets. Only people can change these; no AI employee can lift a kill switch." crumbs={[GROWTH_CRUMB, { label: "Autonomous control" }]} />
      <GrowthTabs active="autonomous" />

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="min-w-0 space-y-4">
          <Panel title="Kill switches" action={anyStop ? <Badge tone="red">Stopped</Badge> : <Badge tone="green">Running as configured</Badge>}>
            <p className="mb-3 text-xs text-dim">Stopping takes effect before the next action, including work already in progress. Anyone who manages growth can stop; only administrators with growth control can resume.</p>
            <ul className="grid gap-2 sm:grid-cols-2">
              {KILL_KEYS.map((k) => (
                <li key={k} className="flex items-center justify-between gap-3 rounded-md border border-line px-3 py-2">
                  <span className="min-w-0 text-sm">
                    <span className="block truncate font-medium text-fg">{KILL_SWITCHES[k]}</span>
                    <StatusBadge value={s.stops[k] ? "STOPPED" : "ACTIVE"} text={s.stops[k] ? "Stopped" : "Not stopped"} />
                  </span>
                  {s.stops[k]
                    ? control && (
                        <ActionForm action={toggleKillSwitchAction.bind(null, k, false)}>
                          <SubmitButton variant="secondary">Resume</SubmitButton>
                        </ActionForm>
                      )
                    : manage && (
                        <ActionForm action={toggleKillSwitchAction.bind(null, k, true)}>
                          <SubmitButton variant="danger">Stop</SubmitButton>
                        </ActionForm>
                      )}
                </li>
              ))}
            </ul>
          </Panel>

          {control ? (
            <ActionForm action={saveGrowthControlAction} className="space-y-4">
              <Panel title="Autonomous mode">
                <CheckField name="autonomousMode" label="AUTONOMOUS_GROWTH_MODE" defaultChecked={s.autonomousMode} hint="When on, the daily scheduler runs the switched-on channels below. Every external action (posts, emails, ads) still needs a person's approval or a person's schedule." />
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {CHANNEL_KEYS.map((k) => (
                    <CheckField key={k} name={`ch_${k}`} label={GROWTH_CHANNELS[k]} defaultChecked={s.channels[k]} />
                  ))}
                </div>
              </Panel>
              <Panel title="Stop individual AI employees or platforms">
                <div className="grid gap-4 sm:grid-cols-2">
                  <fieldset>
                    <legend className="mb-1 text-[12.5px] font-medium text-fg">AI employees</legend>
                    <div className="grid gap-1.5">
                      {AGENTS.map((a) => (
                        <label key={a.slug} className="flex items-center gap-2 text-sm"><input type="checkbox" name="stoppedAgents" value={a.slug} defaultChecked={s.stoppedAgents.includes(a.slug)} className="size-4" /> {a.name}</label>
                      ))}
                    </div>
                  </fieldset>
                  <fieldset>
                    <legend className="mb-1 text-[12.5px] font-medium text-fg">Platforms</legend>
                    <div className="grid gap-1.5">
                      {SOCIAL_PLATFORMS.map((p) => (
                        <label key={p} className="flex items-center gap-2 text-sm"><input type="checkbox" name="stoppedPlatforms" value={p} defaultChecked={s.stoppedPlatforms.includes(p)} className="size-4" /> {PLATFORM_LABELS[p]}</label>
                      ))}
                    </div>
                  </fieldset>
                </div>
              </Panel>
              <Panel title="Budgets">
                <p className="mb-3 text-xs text-dim">A blank budget blocks that kind of spend or sending. Budgets are checked before every action and are never exceeded silently.</p>
                <div className="grid gap-3 sm:grid-cols-3">
                  {BUDGET_KEYS.map((k) => (
                    <TextField key={k} name={`budget_${k}`} type="number" label={BUDGET_KINDS[k].label} defaultValue={s.budgets[k]} hint={`Used ${BUDGET_KINDS[k].unit === "money" ? `${s.budgetCurrency} ` : ""}${used[k]} ${k.endsWith("Monthly") ? "this month" : "today"}`} />
                  ))}
                  <SelectField name="budgetCurrency" label="Budget currency" options={["USD", "EUR", "GBP", "AED", "SAR", "INR", "SGD", "AUD", "CAD"].map((c) => [c, c] as const)} defaultValue={s.budgetCurrency} />
                  <TextField name="dailyQualifiedLeadTarget" type="number" label="Qualified leads per day (target)" defaultValue={s.dailyQualifiedLeadTarget} hint="A goal for the dashboard, not a guarantee." />
                </div>
              </Panel>
              <Panel title="Languages and brand voice">
                <div className="mb-3 flex flex-wrap gap-4">
                  {Object.entries(LANGUAGES).map(([k, l]) => (
                    <label key={k} className="flex items-center gap-2 text-sm"><input type="checkbox" name="languages" value={k} defaultChecked={s.languages.includes(k)} className="size-4" /> {l}</label>
                  ))}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <TextArea name="brandVoice" label="Brand voice rules" rows={5} defaultValue={s.brandVoice} />
                  <TextArea name="bannedPhrases" label="Banned phrases (one per line)" rows={5} defaultValue={s.bannedPhrases.join("\n")} hint="Content QA blocks posts that contain these." />
                </div>
              </Panel>
              <SubmitButton>Save growth controls</SubmitButton>
            </ActionForm>
          ) : (
            <Panel title="Settings">
              <p className="text-sm text-muted">Autonomous mode is <strong>{s.autonomousMode ? "on" : "off"}</strong>. Channels on: {CHANNEL_KEYS.filter((k) => s.channels[k]).map((k) => GROWTH_CHANNELS[k]).join(", ") || "none"}. Only administrators with growth control can change these.</p>
            </Panel>
          )}

          <Panel title="AI growth workforce" bodyClassName="p-0">
            <DataTable
              rows={GROWTH_ROLES.map((r) => ({ ...r, id: r.key }))}
              columns={[
                { header: "Responsibility", cell: (r) => r.title },
                { header: "Owner (existing AI employee)", cell: (r) => AGENTS.find((a) => a.slug === r.agent)?.name ?? r.agent },
                { header: "Approval", cell: (r) => (r.approval ? <Badge tone="amber">Human approval</Badge> : <Badge>Internal</Badge>) },
                { header: "Status", cell: (r) => <StatusBadge value={s.stops.all || s.stops.ai || s.stoppedAgents.includes(r.agent) ? "STOPPED" : "ACTIVE"} /> },
              ]}
            />
          </Panel>
        </div>

        <div className="min-w-0 space-y-4">
          <Panel title="Daily loop" action={control ? <ActionForm action={runGrowthLoopNowAction}><SubmitButton variant="secondary">Run now</SubmitButton></ActionForm> : undefined}>
            <p className="mb-2 text-xs text-dim">Runs with the existing daily scheduler (/api/cron/daily). Honours every switch above.</p>
            {runs.length ? (
              <ul className="space-y-2 text-sm">
                {runs.map((r) => (
                  <li key={r.id} className="rounded-md border border-line px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted">{fmtDate(r.startedAt, true)} · {r.trigger.toLowerCase()}</span>
                      <StatusBadge value={r.status} />
                    </div>
                    {Array.isArray(r.steps) && (
                      <ul className="mt-1 space-y-0.5 text-xs text-dim">
                        {(r.steps as { step: string; status: string; detail: string }[]).map((x, i) => (
                          <li key={i}><span className="font-mono">{x.step}</span> · {x.status} · {x.detail}</li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-dim">No runs yet.</p>
            )}
          </Panel>
          <Panel title="Providers">
            <ul className="space-y-2 text-sm">
              {providers.map((p) => (
                <li key={p.key} className="flex items-start justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block text-fg">{p.name}</span>
                    <span className="block text-[11px] text-dim uppercase">{p.kind}</span>
                    {!p.connected && <span className="block font-mono text-[11px] break-all text-dim">{p.env.join(", ")}</span>}
                  </span>
                  <StatusBadge value={p.connected ? "CONNECTED" : "NOT_CONNECTED"} text={p.connected ? "Connected" : "Not connected"} />
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-dim">Credentials are read from server environment variables only and are never shown or stored in the database. Unconnected providers report NOT_CONNECTED; nothing is simulated.</p>
          </Panel>
        </div>
      </div>
    </>
  );
}
