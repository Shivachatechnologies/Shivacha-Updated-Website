import { db } from "@/lib/db/client";
import { qualifyNowAction } from "@/lib/growth/actions";
import { TIER_LABELS, type Tier } from "@/lib/growth/qualify";
import { StatusBadge } from "@/components/admin/os";
import { Panel, fmtDate } from "@/components/admin/ui";
import { ActionForm } from "@/components/admin/forms";
import { SubmitButton } from "@/components/admin/client";

/** Latest growth qualification on the lead page: tier, sub-scores, the signals behind them and the reason. */
export async function LeadQualificationPanel({ leadId, canRescore }: { leadId: string; canRescore: boolean }) {
  const q = await db.leadQualification.findFirst({ where: { leadId }, orderBy: { createdAt: "desc" } });
  const signals = (Array.isArray(q?.signals) ? q.signals : []) as string[];
  return (
    <Panel
      title="Growth qualification"
      action={
        canRescore ? (
          <ActionForm action={qualifyNowAction.bind(null, leadId)}>
            <SubmitButton variant="secondary">{q ? "Re-score" : "Score now"}</SubmitButton>
          </ActionForm>
        ) : undefined
      }
    >
      {q ? (
        <div className="space-y-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge value={q.tier} text={`${TIER_LABELS[q.tier as Tier] ?? q.tier} · ${q.total}/100`} />
            <span className="text-xs text-dim">{fmtDate(q.createdAt, true)} · by {q.scoredBy}</span>
          </div>
          <dl className="grid grid-cols-5 gap-2 text-center">
            {(["fit", "intent", "engagement", "budget", "timeline"] as const).map((k) => (
              <div key={k} className="rounded-md border border-line px-1 py-1.5">
                <dt className="text-[10.5px] text-dim uppercase">{k}</dt>
                <dd className="font-semibold tabular-nums">{q[k]}</dd>
              </div>
            ))}
          </dl>
          <p className="text-muted">{q.reason}</p>
          {signals.length > 0 && (
            <ul className="flex flex-wrap gap-1.5 text-xs">
              {signals.map((s, i) => (
                <li key={i} className={`rounded border px-1.5 py-0.5 ${s.startsWith("-") ? "border-red-300 text-red-700" : "border-line text-muted"}`}>{s}</li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <p className="text-sm text-dim">Not scored yet. The daily growth loop scores new leads when lead generation is switched on.</p>
      )}
    </Panel>
  );
}
