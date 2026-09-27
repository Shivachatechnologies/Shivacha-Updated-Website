import { can } from "@/lib/auth/permissions";
import { requireAccess } from "@/lib/os/guard";
import { db } from "@/lib/db/client";
import { AGENTS } from "@/lib/ai/catalog";
import { ensureAgents } from "@/lib/ai/agents";
import { blockedAttempts, getWorkforceConfig, spentToday } from "@/lib/ai/control";
import { activateEmergencyStopAction, resumeEmergencyStopAction, saveAgentControlAction, saveWorkforceControlsAction, setWorkforcePausedAction } from "@/lib/ai/control-actions";
import { PageHeader, Panel, fmtDate, inputCls, labelCls } from "@/components/admin/ui";
import { ActionForm, FieldError } from "@/components/admin/forms";
import { ConfirmButton, SubmitButton } from "@/components/admin/client";
import { StatusBadge } from "@/components/admin/os";

export const metadata = { title: "AI Workforce Control Center" };

function Toggle({ name, label, hint, checked, disabled }: { name: string; label: string; hint: string; checked: boolean; disabled?: boolean }) {
  return (
    <label className="flex items-start gap-3 rounded-md border border-line p-3 text-sm">
      <input type="checkbox" name={name} defaultChecked={checked} disabled={disabled} className="mt-0.5 size-4 accent-[var(--color-brand-blue)]" />
      <span><span className="font-medium text-fg">{label}</span><span className="block text-[12px] text-dim">{hint}</span></span>
    </label>
  );
}

const State = ({ on, yes, no }: { on: boolean; yes: string; no: string }) => <StatusBadge value={on ? "ACTIVE" : "INACTIVE"} text={on ? yes : no} />;

export default async function ControlCenter() {
  const user = await requireAccess("ai:view", "AI_WORKFORCE");
  const configure = can(user.role, "ai:configure");
  const superAdmin = user.role === "SUPER_ADMIN";
  await ensureAgents();
  const [cfg, spent, agents, running, held, blocked] = await Promise.all([
    getWorkforceConfig(),
    spentToday(),
    db.aIAgent.findMany({ where: { slug: { in: AGENTS.map((a) => a.slug) } }, select: { slug: true, name: true, enabled: true, mode: true, autonomousAllowed: true, backgroundTasksAllowed: true, voiceAllowed: true, dailyCostLimit: true, controlUpdatedAt: true } }),
    db.aITask.count({ where: { status: "RUNNING" } }),
    db.aITask.count({ where: { status: "QUEUED", currentStep: { startsWith: "On hold" } } }),
    blockedAttempts(),
  ]);
  const bySlug = new Map(agents.map((a) => [a.slug, a]));
  const budget = cfg.dailyBudget == null ? null : Number(cfg.dailyBudget);
  const workforceOn = cfg.enabled && !cfg.paused && !cfg.emergencyStop;

  return (
    <>
      <PageHeader title="AI Workforce Control Center" description="Server-enforced switches for every AI employee, model call, tool, background task, voice session and external action." crumbs={[{ label: "AI", href: "/admin/ai" }, { label: "Control Center" }]} />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Panel><p className="text-[11.5px] text-dim uppercase">Workforce</p><p className="mt-1"><StatusBadge value={cfg.emergencyStop ? "FAILED" : workforceOn ? "ACTIVE" : "ON_HOLD"} text={cfg.emergencyStop ? "EMERGENCY STOP" : !cfg.enabled ? "OFF" : cfg.paused ? "PAUSED" : "RUNNING"} /></p></Panel>
        <Panel><p className="text-[11.5px] text-dim uppercase">Spend today (UTC)</p><p className="mt-1 text-lg font-semibold text-fg">${spent.toFixed(4)}<span className="text-sm font-normal text-dim"> / {budget == null ? "no limit" : `$${budget.toFixed(2)}`}</span></p></Panel>
        <Panel><p className="text-[11.5px] text-dim uppercase">Tasks</p><p className="mt-1 text-sm text-fg">{running} running · {held} on hold</p></Panel>
        <Panel><p className="text-[11.5px] text-dim uppercase">Blocked attempts (24h)</p><p className="mt-1 text-lg font-semibold text-fg">{blocked}</p></Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-5">
          <Panel title="AI Workforce Control Center" action={configure && !cfg.emergencyStop ? (
            <ActionForm action={setWorkforcePausedAction.bind(null, !cfg.paused)}>
              <SubmitButton variant={cfg.paused ? "primary" : "secondary"}>{cfg.paused ? "Resume all AI employees" : "Pause all AI employees"}</SubmitButton>
            </ActionForm>
          ) : undefined}>
            <div className="mb-4 flex flex-wrap gap-2 text-xs">
              <State on={cfg.enabled} yes="Workforce ON" no="Workforce OFF" />
              <State on={!cfg.paused} yes="RUNNING" no="PAUSED" />
              <StatusBadge value={cfg.emergencyStop ? "FAILED" : "INACTIVE"} text={cfg.emergencyStop ? "Emergency stop ACTIVE" : "Emergency stop INACTIVE"} />
              <State on={cfg.autonomousEnabled} yes="Autonomous ENABLED" no="Autonomous DISABLED" />
              <State on={cfg.backgroundTasksEnabled} yes="Background tasks ON" no="Background tasks OFF" />
              <State on={cfg.voiceEnabled} yes="Voice ON" no="Voice OFF" />
              <State on={cfg.externalActionsEnabled} yes="External actions ON" no="External actions OFF" />
            </div>
            {configure ? (
              <ActionForm action={saveWorkforceControlsAction} className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Toggle name="enabled" label="AI Workforce ON" hint="Off blocks every AI employee, model call and tool." checked={cfg.enabled} />
                  <Toggle name="paused" label="Pause all AI employees" hint="Temporarily blocks new AI work; queued tasks wait and resume later." checked={cfg.paused} />
                  <Toggle name="autonomousEnabled" label="Autonomous mode" hint={`Off makes AUTONOMOUS employees ask for approval instead.${superAdmin ? "" : " Only a Super Admin can switch it back on."}`} checked={cfg.autonomousEnabled} disabled={!superAdmin && !cfg.autonomousEnabled} />
                  <Toggle name="backgroundTasksEnabled" label="Background AI tasks" hint="Off stops new tasks being queued and holds queued ones." checked={cfg.backgroundTasksEnabled} />
                  <Toggle name="voiceEnabled" label="AI voice employees" hint="Off blocks voice sessions and speech provider calls." checked={cfg.voiceEnabled} />
                  <Toggle name="externalActionsEnabled" label="External actions" hint="Off blocks customer emails and web research, including approved ones." checked={cfg.externalActionsEnabled} />
                </div>
                <label className="block max-w-xs"><span className={labelCls}>Daily AI budget, all employees (USD, blank = no limit)</span><input name="dailyBudget" defaultValue={cfg.dailyBudget?.toString() ?? ""} inputMode="decimal" className={inputCls} /><FieldError name="dailyBudget" /></label>
                <div className="flex items-center gap-3">
                  <SubmitButton>Save controls</SubmitButton>
                  {cfg.updatedAt && <span className="text-[12px] text-dim">Last changed {fmtDate(cfg.updatedAt, true)}</span>}
                </div>
              </ActionForm>
            ) : (
              <p className="text-sm text-muted">Only administrators with AI configuration access can change these controls.</p>
            )}
          </Panel>

          <Panel title="AI employees">
            <div className="hidden grid-cols-[minmax(0,1.4fr)_repeat(4,84px)_110px_90px] gap-2 border-b border-line pb-2 text-[11px] text-dim uppercase md:grid">
              <span>Employee</span><span className="text-center">Enabled</span><span className="text-center">Autonomous</span><span className="text-center">Background</span><span className="text-center">Voice</span><span>Daily limit $</span><span />
            </div>
            <div className="divide-y divide-line">
              {AGENTS.map((spec) => {
                const a = bySlug.get(spec.slug);
                if (!a) return null;
                const box = (name: string, checked: boolean, label: string, disabled = false) => (
                  <label className="flex items-center gap-2 text-xs md:justify-center"><input type="checkbox" name={name} defaultChecked={checked} disabled={!configure || disabled} aria-label={`${label} for ${a.name}`} className="size-4 accent-[var(--color-brand-blue)]" /><span className="md:hidden">{label}</span></label>
                );
                const row = (
                  <div className="grid grid-cols-2 items-center gap-2 py-2.5 md:grid-cols-[minmax(0,1.4fr)_repeat(4,84px)_110px_90px]">
                    <div className="col-span-2 min-w-0 md:col-span-1">
                      <p className="truncate text-sm font-medium text-fg">{a.name}</p>
                      <p className="text-[11.5px] text-dim">{a.mode.toLowerCase()}{a.controlUpdatedAt ? ` · changed ${fmtDate(a.controlUpdatedAt, true)}` : ""}</p>
                    </div>
                    {box("enabled", a.enabled, "Enabled")}
                    {box("autonomousAllowed", a.autonomousAllowed, "Autonomous", !superAdmin && !a.autonomousAllowed)}
                    {box("backgroundTasksAllowed", a.backgroundTasksAllowed, "Background")}
                    {box("voiceAllowed", a.voiceAllowed, "Voice")}
                    <input name="dailyCostLimit" defaultValue={a.dailyCostLimit?.toString() ?? ""} placeholder="none" inputMode="decimal" disabled={!configure} aria-label={`Daily cost limit for ${a.name}`} className={`${inputCls} h-8`} />
                    {configure ? <SubmitButton variant="secondary" className="h-8">Save</SubmitButton> : <span />}
                  </div>
                );
                return configure ? <ActionForm key={spec.slug} action={saveAgentControlAction.bind(null, spec.slug)}>{row}</ActionForm> : <div key={spec.slug}>{row}</div>;
              })}
            </div>
            <p className="mt-2 text-[11.5px] text-dim">Disabling an employee blocks chat, voice, tasks and approvals for it. Autonomous work also needs the employee in AUTONOMOUS mode (Agent Config) and the global switch on.</p>
          </Panel>
        </div>

        <aside className="space-y-5">
          <Panel title="Emergency Kill Switch" className={cfg.emergencyStop ? "border-red-600" : undefined}>
            <div id="emergency" className="scroll-mt-20">
              <p className="mb-3"><StatusBadge value={cfg.emergencyStop ? "FAILED" : "INACTIVE"} text={cfg.emergencyStop ? "ACTIVE" : "INACTIVE"} /></p>
              {cfg.emergencyStop ? (
                <>
                  <p className="text-sm text-muted">Every new AI execution is blocked on the server. Running tasks stopped at their next model or tool call and are on hold in the queue.</p>
                  {configure && (
                    <ActionForm action={resumeEmergencyStopAction} className="mt-4 space-y-3">
                      <label className="block"><span className={labelCls}>Type RESUME to confirm</span><input name="confirm" autoComplete="off" className={inputCls} /><FieldError name="confirm" /></label>
                      <ConfirmButton danger={false} confirmLabel="Resume AI workforce" message="AI employees, background tasks, voice and external actions will be allowed again according to the other controls.">Resume AI workforce</ConfirmButton>
                    </ActionForm>
                  )}
                </>
              ) : configure ? (
                <ActionForm action={activateEmergencyStopAction} className="space-y-3">
                  <p className="text-sm text-muted">Immediately blocks all AI employees, provider calls, tools, autonomous work, background tasks, voice and external actions. Read-only reports that do not call an AI model keep working.</p>
                  <label className="block"><span className={labelCls}>Reason (recorded in the audit log)</span><textarea name="reason" rows={3} maxLength={500} className={`${inputCls} h-auto py-2`} /><FieldError name="reason" /></label>
                  <label className="block"><span className={labelCls}>Type STOP to confirm</span><input name="confirm" autoComplete="off" className={inputCls} /><FieldError name="confirm" /></label>
                  <ConfirmButton confirmLabel="Activate emergency stop" message="This stops the entire AI workforce right away. Only an administrator can resume it.">Activate emergency stop</ConfirmButton>
                </ActionForm>
              ) : (
                <p className="text-sm text-muted">Only administrators with AI configuration access can use the kill switch.</p>
              )}
            </div>
          </Panel>
        </aside>
      </div>
    </>
  );
}
