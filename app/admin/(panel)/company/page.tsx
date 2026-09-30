import Link from "next/link";
import { db } from "@/lib/db/client";
import { can } from "@/lib/auth/permissions";
import { requireAccess } from "@/lib/os/guard";
import { providerStatus } from "@/lib/ai/provider";
import { agentBySlug } from "@/lib/ai/catalog";
import { pumpSoon } from "@/lib/ai/workforce/scheduler";
import { leadProviders, emailProvider, SOCIAL_PROVIDERS } from "@/lib/growth/providers";
import { hydrateVault } from "@/lib/integrations/vault";
import { ensureOrganisationOnce, orgChart } from "@/lib/company/organisation";
import { getCompanyProfile } from "@/lib/company/profile";
import { progressFrom } from "@/lib/company/objective-status";
import { regionalPerformance } from "@/lib/company/analytics";
import { buildBriefing } from "@/lib/company/briefing";
import { DEPARTMENTS } from "@/lib/company/org";
import { PLAYBOOKS, type Playbook } from "@/lib/company/objective-rules";
import { createObjectiveAction, resolveMessageAction } from "@/lib/company/actions";
import { fmtMoney } from "@/lib/os/money";
import { PageHeader, fmtDate } from "@/components/admin/ui";
import { ActionForm } from "@/components/admin/forms";
import { SubmitButton } from "@/components/admin/client";
import { Kpi, KpiGrid, StatusBadge, TextArea, TextField } from "@/components/admin/os";
import { Card, CompanyTabs, COMPANY_CRUMB, Meter, Nature } from "@/components/admin/company/ui";

export const metadata = { title: "AI Company — Command Center" };
export const dynamic = "force-dynamic";

const EXAMPLES = ["Get 100 qualified international leads per day.", "Enter the UAE fintech market.", "Generate $250,000 revenue this month.", "Increase sales pipeline.", "Reduce project delivery delays.", "Launch our SaaS product."];

export default async function CompanyCommandCenter() {
  const user = await requireAccess("ai:view", "AI_WORKFORCE");
  await Promise.all([ensureOrganisationOnce(), hydrateVault()]);
  const exec = can(user.role, "executive:view");
  const since14 = new Date(new Date().getTime() - 14 * 86400_000);
  const [profile, org, objectives, taskCounts, approvals, messages, today, regions, deptOpen] = await Promise.all([
    getCompanyProfile(),
    orgChart(),
    db.aIObjective.findMany({ where: { OR: [{ status: { in: ["PLANNING", "ACTIVE", "BLOCKED"] } }, { updatedAt: { gte: since14 } }] }, orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 12 }),
    db.aITask.groupBy({ by: ["status"], where: { status: { in: ["QUEUED", "RUNNING", "WAITING", "AWAITING_APPROVAL", "PAUSED"] } }, _count: { _all: true } }),
    db.aIApproval.count({ where: { status: "PENDING" } }),
    db.aIWorkMessage.findMany({ where: { status: "OPEN", kind: { in: ["ESCALATION", "BLOCKER"] }, ...(exec ? { OR: [{ toUserId: { not: null } }, { toSlug: "ceo" }] } : { toUserId: user.id }) }, orderBy: { createdAt: "desc" }, take: 10 }),
    buildBriefing("today", user.role),
    can(user.role, "leads:view") ? regionalPerformance(30, { deals: can(user.role, "deals:view") }) : null,
    db.aITask.groupBy({ by: ["agentSlug"], where: { status: { in: ["QUEUED", "RUNNING", "WAITING", "AWAITING_APPROVAL", "PAUSED"] } }, _count: { _all: true } }),
  ]);
  pumpSoon();
  const objTasks = objectives.length ? await db.aITask.findMany({ where: { objectiveId: { in: objectives.map((o) => o.id) } }, select: { objectiveId: true, status: true } }) : [];
  const tc = (s: string) => taskCounts.find((t) => t.status === s)?._count._all ?? 0;
  const deptOf = new Map(org.map((n) => [n.slug, n.department]));
  const openByDept = new Map<string, number>();
  for (const g of deptOpen) openByDept.set(deptOf.get(g.agentSlug) ?? "", (openByDept.get(deptOf.get(g.agentSlug) ?? "") ?? 0) + g._count._all);
  const ai = providerStatus();
  const providers: [string, boolean, string][] = [
    ["AI provider (Anthropic)", ai.connected, "/admin/integrations/connect"],
    ["Apollo", leadProviders.apollo.status().connected, "/admin/integrations/connect"],
    ["Hunter", leadProviders.hunter.status().connected, "/admin/integrations/connect"],
    ["Email", emailProvider.status().connected, "/admin/integrations/connect"],
    [`Social (${Object.values(SOCIAL_PROVIDERS).filter((p) => p.status().connected).length}/5)`, Object.values(SOCIAL_PROVIDERS).some((p) => p.status().connected), "/admin/integrations/connect"],
  ];
  const activeDeps = DEPARTMENTS.filter((d) => profile.departments.includes(d.key));

  return (
    <>
      <PageHeader title="CEO Command Center" description={`${profile.name}: tell the AI company what to achieve. The Chief of Staff turns it into a plan, executives and teams get real tasks, and you see every result, blocker and approval here.`} crumbs={[COMPANY_CRUMB, { label: "Command Center" }]} />
      <CompanyTabs active="command" />

      {exec && (
        <section className="mt-4 rounded-xl border border-violet-400/20 bg-gradient-to-br from-violet-500/[0.07] to-transparent p-5">
          <h2 className="text-base font-semibold text-fg">What do you want the company to achieve?</h2>
          <ActionForm action={createObjectiveAction} className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_12rem_auto] md:items-end">
            <TextArea name="statement" label="Objective" rows={2} required placeholder={EXAMPLES[0]} />
            <TextField name="dueAt" type="date" label="Due (optional)" />
            <SubmitButton>Plan & start</SubmitButton>
          </ActionForm>
          <p className="mt-2 text-xs text-muted">Examples: {EXAMPLES.join(" · ")}. Targets are goals, not guarantees; external actions follow the approval policy{profile.strictApprovals ? " (strict approval mode is ON)" : ""}.</p>
        </section>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
        {providers.map(([name, ok, href]) => (
          <Link key={name} href={href} className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 hover:border-line-strong">
            <span className={ok ? "size-1.5 rounded-full bg-emerald-500" : "size-1.5 rounded-full bg-zinc-400"} />
            {name}: <span className={ok ? "text-emerald-700" : "text-dim"}>{ok ? "CONNECTED" : "NOT CONNECTED"}</span>
          </Link>
        ))}
      </div>

      <div className="mt-4">
        <KpiGrid cols={6}>
          <Kpi label="Active objectives" value={objectives.filter((o) => o.status === "ACTIVE" || o.status === "PLANNING").length} href="/admin/company/objectives" />
          <Kpi label="Blocked objectives" value={objectives.filter((o) => o.status === "BLOCKED").length} tone={objectives.some((o) => o.status === "BLOCKED") ? "red" : undefined} href="/admin/company/objectives?s=BLOCKED" />
          <Kpi label="AI employees" value={org.length} hint={`${org.filter((n) => n.enabled && n.available).length} available`} href="/admin/company/org" />
          <Kpi label="Tasks running" value={tc("RUNNING")} hint={`${tc("QUEUED")} queued · ${tc("WAITING")} waiting on team`} href="/admin/ai/tasks" />
          <Kpi label="Approvals required" value={approvals} tone={approvals ? "amber" : undefined} href="/admin/ai/approvals" />
          <Kpi label="Escalations for you" value={messages.length} tone={messages.length ? "red" : undefined} />
        </KpiGrid>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card title="Company objectives" href="/admin/company/objectives">
          {objectives.length ? (
            <ul className="space-y-3">
              {objectives.map((o) => {
                const p = progressFrom(objTasks.filter((t) => t.objectiveId === o.id));
                return (
                  <li key={o.id} className="rounded-md border border-line p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Link href={`/admin/company/objectives/${o.id}`} className="min-w-0 truncate text-sm font-medium text-fg hover:underline">{o.title}</Link>
                      <StatusBadge value={o.status} />
                    </div>
                    <p className="mt-0.5 text-xs text-dim">{PLAYBOOKS[o.playbook as Playbook] ?? o.playbook}{o.targetMetric ? ` · target ${o.targetMetric.replace(/_/g, " ")} = ${o.targetValue}` : ""} · {p.done}/{p.total} tasks done{p.failed ? ` · ${p.failed} failed` : ""}</p>
                    <div className="mt-2"><Meter pct={p.pct} tone={o.status === "BLOCKED" ? "red" : o.status === "COMPLETED" ? "green" : "blue"} /></div>
                    {o.blockedReason && <p className="mt-1.5 text-xs text-red-700">{o.blockedReason}</p>}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-dim">No objectives yet. Give the company its first objective above.</p>
          )}
        </Card>

        <div className="space-y-4">
          <Card title="Escalations & decisions for you">
            {messages.length ? (
              <ul className="space-y-2.5">
                {messages.map((m) => (
                  <li key={m.id} className="text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0"><StatusBadge value={m.kind} /> <span className="font-medium text-fg">{m.subject}</span></p>
                      <ActionForm action={resolveMessageAction.bind(null, m.id)}><SubmitButton variant="secondary">Handled</SubmitButton></ActionForm>
                    </div>
                    <p className="mt-0.5 text-xs text-muted">{agentBySlug(m.fromSlug)?.name ?? m.fromSlug} · {fmtDate(m.createdAt, true)} — {m.body.slice(0, 240)}</p>
                    {(m.objectiveId || m.taskId) && <Link className="text-xs text-brand-blue hover:underline" href={m.objectiveId ? `/admin/company/objectives/${m.objectiveId}` : `/admin/ai/tasks/${m.taskId}`}>Open</Link>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-dim">Nothing needs your decision.</p>
            )}
          </Card>
          <Card title="Today" href="/admin/company/briefing">
            <ul className="grid grid-cols-2 gap-2 text-sm">
              {today.sections.flatMap((s) => s.metrics.slice(0, 3)).slice(0, 12).map((m) => (
                <li key={m.label} className="min-w-0 rounded-md border border-line px-2.5 py-2">
                  <p className="truncate text-[11px] text-dim uppercase">{m.label}</p>
                  <p className="flex items-center gap-1.5 truncate font-semibold text-fg tabular-nums">{m.value} <Nature value={m.nature} /></p>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <Card title="Departments" href="/admin/company/org">
          <ul className="grid gap-2 sm:grid-cols-2">
            {activeDeps.map((d) => {
              const members = org.filter((n) => n.department === d.key);
              const head = org.find((n) => n.slug === d.head);
              return (
                <li key={d.key} className="rounded-md border border-line px-3 py-2">
                  <Link href={`/admin/company/org#${d.key}`} className="text-sm font-medium text-fg hover:underline">{d.name}</Link>
                  <p className="text-xs text-dim">{members.length} AI employees · {openByDept.get(d.key) ?? 0} open tasks</p>
                  {head && <p className="truncate text-xs text-muted">Head: {head.jobTitle}</p>}
                </li>
              );
            })}
          </ul>
        </Card>
        {regions && (
          <Card title="Regional performance (30 days)">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] text-dim uppercase">
                  <th className="py-1 font-medium">Region</th>
                  <th className="font-medium">Leads</th>
                  <th className="font-medium">Qualified</th>
                  <th className="font-medium">Prospects</th>
                  {can(user.role, "deals:view") && <th className="font-medium">Won</th>}
                </tr>
              </thead>
              <tbody>
                {[...regions.rows, regions.unassigned].map((r) => (
                  <tr key={r.key} className="border-t border-line">
                    <td className="py-1.5">{r.name}</td>
                    <td className="tabular-nums">{r.leads}</td>
                    <td className="tabular-nums">{r.qualified}</td>
                    <td className="tabular-nums">{r.prospects}</td>
                    {can(user.role, "deals:view") && <td className="text-xs tabular-nums">{r.wonDeals ? `${r.wonDeals} · ${Object.entries(r.wonValue).map(([c, v]) => fmtMoney(String(v), c)).join(" · ")}` : "0"}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-dim">Placed by each record&apos;s country. Records without a country cannot be attributed to a region.</p>
          </Card>
        )}
      </div>
    </>
  );
}
