import { db } from "@/lib/db/client";
import { can } from "@/lib/auth/permissions";
import { requireAccess } from "@/lib/os/guard";
import { ALL_AGENTS as AGENTS } from "@/lib/ai/catalog";
import { ACTIVE_KILL_KEYS, BUDGET_KEYS, BUDGET_KINDS, ENFORCED_BUDGETS, GROWTH_CHANNELS, IMPLEMENTED_CHANNELS, NOT_IMPLEMENTED_CHANNELS, KILL_SWITCHES, LANGUAGES, PLATFORM_LABELS, SOCIAL_PLATFORMS } from "@/lib/growth/policy";
import { getGrowthSettings } from "@/lib/growth/settings";
import { usageOf } from "@/lib/growth/engine";
import { providerStatuses } from "@/lib/growth/providers";
import { GROWTH_ROLES } from "@/lib/growth/workforce-map";
import { runGrowthLoopNowAction, saveGrowthControlAction, toggleKillSwitchAction } from "@/lib/growth/actions";
import { CheckField, DataTable, StatusBadge, TextArea, TextField } from "@/components/admin/os";
import { Badge, PageHeader, Panel, fmtDate } from "@/components/admin/ui";
import { ActionForm } from "@/components/admin/forms";
import { SubmitButton } from "@/components/admin/client";
import { GROWTH_CRUMB, GrowthTabs } from "@/components/admin/growth/tabs";

export const metadata = { title: "Autonomous growth control" };
export const dynamic = "force-dynamic";

/** Honest capability list: what the loop does, what a person does, and what this release does not do. */
const CAPABILITIES: [string, "AUTOMATED" | "MANUAL" | "NOT_SUPPORTED" | "NOT_IMPLEMENTED", string][] = [
  ["Lead qualification", "AUTOMATED", "Rules-based scoring of new leads (last 30 days) when lead qualification is on."],
  ["Email sequence steps", "AUTOMATED", "Due steps are sent once each, within the email budget, with an unsubscribe link."],
  ["Publishing approved posts", "AUTOMATED", "Only posts a person approved and scheduled; LinkedIn, Facebook, X, Instagram images."],
  ["Follower counts", "AUTOMATED", "Pulled from connected platform APIs when the social channel is on."],
  ["Post approval and scheduling", "MANUAL", "A person approves every post."],
  ["Reach, impressions, engagement", "MANUAL", "Entered from each platform's own report; not pulled from APIs."],
  ["Replies, bounces, complaints", "MANUAL", "Logged on the Email page or sent to the email-events webhook; the inbox is not read automatically."],
  ["YouTube uploads", "NOT_SUPPORTED", "Upload in YouTube Studio, then mark the post published."],
  ["Instagram reels and video", "NOT_SUPPORTED", "Upload in the Instagram app, then mark the post published."],
  ["Paid-ad buying and spend sync", "NOT_IMPLEMENTED", "Enter spend on each campaign."],
  ["Image and video generation", "NOT_IMPLEMENTED", "AI writes briefs and scripts for a person to produce."],
  ["Community replies and DMs", "NOT_IMPLEMENTED", "Written and sent by a person."],
  ["Campaign optimisation", "NOT_IMPLEMENTED", "No automatic changes to campaigns, content or budgets."],
];

export default async function AutonomousPage() {
  const user = await requireAccess("growth:view", "GROWTH");
  const control = can(user.role, "growth:control");
  const manage = can(user.role, "growth:manage");
  const [s, runs, usage] = await Promise.all([
    getGrowthSettings(),
    db.growthRun.findMany({ orderBy: { startedAt: "desc" }, take: 10 }),
    Promise.all(ENFORCED_BUDGETS.map(async (k) => [k, await usageOf(k)] as const)),
  ]);
  const used = Object.fromEntries(usage) as Record<(typeof ENFORCED_BUDGETS)[number], number>;
  const providers = providerStatuses();
  const anyStop = ACTIVE_KILL_KEYS.some((k) => s.stops[k]);
  return (
    <>
      <PageHeader title="Autonomous growth control" description="AUTONOMOUS_GROWTH_MODE, channel switches, kill switches and budgets. Only people can change these; no AI employee can lift a kill switch." crumbs={[GROWTH_CRUMB, { label: "Autonomous control" }]} />
      <GrowthTabs active="autonomous" />

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="min-w-0 space-y-4">
          <Panel title="Kill switches" action={anyStop ? <Badge tone="red">Stopped</Badge> : <Badge tone="green">Running as configured</Badge>}>
            <p className="mb-3 text-xs text-dim">Stopping takes effect before the next action, including work already in progress. Anyone who manages growth can stop; only administrators with growth control can resume.</p>
            <ul className="grid gap-2 sm:grid-cols-2">
              {ACTIVE_KILL_KEYS.map((k) => (
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
            <p className="mt-3 text-xs text-dim">There is no paid-ads switch: no automated ad action exists in this release, so there is nothing for it to stop.</p>
          </Panel>

          {control ? (
            <ActionForm action={saveGrowthControlAction} className="space-y-4">
              <Panel title="Autonomous mode">
                <CheckField name="autonomousMode" label="AUTONOMOUS_GROWTH_MODE" defaultChecked={s.autonomousMode} hint="When off, the growth loop does nothing and contacts no provider. When on, it runs only the channels switched on below. Posts still need a person's approval and schedule; AI-written customer emails still need approval." />
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {IMPLEMENTED_CHANNELS.map((k) => (
                    <CheckField key={k} name={`ch_${k}`} label={GROWTH_CHANNELS[k]} defaultChecked={s.channels[k]} />
                  ))}
                </div>
                <div className="mt-4 rounded-md border border-dashed border-line-strong p-3 text-xs text-muted">
                  <p className="font-medium text-fg">Not implemented (no switch)</p>
                  <ul className="mt-1 space-y-1">
                    {Object.entries(NOT_IMPLEMENTED_CHANNELS).map(([k, why]) => (
                      <li key={k}><StatusBadge value="NOT_IMPLEMENTED" text="Not implemented" /> <span className="font-medium text-fg">{GROWTH_CHANNELS[k as keyof typeof GROWTH_CHANNELS]}</span> — {why}</li>
                    ))}
                  </ul>
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
                <p className="mb-3 text-xs text-dim">These budgets are reserved in the database before every automated action of that kind, so they can never be exceeded, even with several servers running. A blank budget blocks that action entirely.</p>
                <div className="grid gap-3 sm:grid-cols-3">
                  {ENFORCED_BUDGETS.map((k) => (
                    <TextField key={k} name={`budget_${k}`} type="number" label={`${BUDGET_KINDS[k].label}${BUDGET_KINDS[k].unit === "money" ? " (USD)" : ""}`} defaultValue={s.budgets[k]} hint={`${BUDGET_KINDS[k].unit === "money" ? `USD ${used[k].toFixed(2)} reserved` : `${used[k]} used`} today${k === "aiDaily" ? " · each autonomous AI task reserves its maximum possible cost" : ""}`} />
                  ))}
                  <TextField name="dailyQualifiedLeadTarget" type="number" label="Qualified leads per day (target)" defaultValue={s.dailyQualifiedLeadTarget} hint="A goal for the dashboard, not a guarantee." />
                </div>
                <div className="mt-4 rounded-md border border-dashed border-line-strong p-3 text-xs text-muted">
                  <p className="font-medium text-fg">Not used by automated actions yet</p>
                  <p className="mt-1">{BUDGET_KEYS.filter((k) => !BUDGET_KINDS[k].enforced).map((k) => BUDGET_KINDS[k].label).join(" · ")}. This release never buys ads or generates images or video automatically, so there is nothing for these budgets to control. Ad spend is entered on each campaign.</p>
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
              <p className="text-sm text-muted">Autonomous mode is <strong>{s.autonomousMode ? "on" : "off"}</strong>. Channels on: {IMPLEMENTED_CHANNELS.filter((k) => s.channels[k]).map((k) => GROWTH_CHANNELS[k]).join(", ") || "none"}. Only administrators with growth control can change these.</p>
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
            <p className="mb-2 text-xs text-dim">The daily scheduler (/api/cron/daily, 03:30 UTC) runs it only when autonomous mode and the “Scheduled daily run” switch are on. “Run now” is an administrator run and ignores that one switch. Both honour every other switch and kill switch.</p>
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
                    {p.state === "NOT_CONNECTED" && <span className="block font-mono text-[11px] break-all text-dim">{p.env.join(", ")}</span>}
                    {p.note && <span className="block text-[11px] text-dim">{p.note}</span>}
                  </span>
                  <StatusBadge value={p.state} text={p.state === "CONNECTED" ? "Connected" : p.state === "NOT_SUPPORTED" ? "Not supported" : "Not connected"} />
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-dim">Credentials are read from server environment variables only and are never shown or stored in the database. Unconnected providers report NOT_CONNECTED; nothing is simulated.</p>
          </Panel>
          <Panel title="What is automated, manual or not available">
            <ul className="space-y-1.5 text-xs">
              {CAPABILITIES.map(([name, state, detail]) => (
                <li key={name} className="flex items-start justify-between gap-2">
                  <span className="min-w-0"><span className="block text-fg">{name}</span><span className="block text-dim">{detail}</span></span>
                  <StatusBadge value={state} text={state.replace("_", " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase())} />
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </>
  );
}
