import Link from "next/link";
import { db } from "@/lib/db/client";
import { getWorkforceConfig } from "@/lib/ai/control";
import { fmtDate } from "@/components/admin/ui";

/** Red status shown across the AI pages while the emergency stop (or a full halt) is in effect. Reads the database, not client state. */
export async function WorkforceStatusBanner({ canConfigure, showResumeLink = true }: { canConfigure: boolean; showResumeLink?: boolean }) {
  const cfg = await getWorkforceConfig().catch(() => null);
  if (!cfg) return null;
  if (cfg.emergencyStop) {
    const ids = [cfg.emergencyById, cfg.updatedById].filter((x): x is string => !!x);
    const users = ids.length ? await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : [];
    const name = (id: string | null) => users.find((u) => u.id === id)?.name ?? "Unknown";
    return (
      <div role="alert" className="mb-5 rounded-lg border-2 border-red-600 bg-red-500/10 p-4 text-red-700">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-base font-bold tracking-wide">🔴 AI WORKFORCE EMERGENCY STOP ACTIVE</p>
            <p className="mt-1 text-sm">No AI employee, provider call, tool, background task, voice session or external action can run.</p>
            <dl className="mt-2 grid gap-x-6 gap-y-1 text-[13px] sm:grid-cols-2">
              <div><dt className="inline font-semibold">Activated by: </dt><dd className="inline">{name(cfg.emergencyById)}</dd></div>
              <div><dt className="inline font-semibold">Activated: </dt><dd className="inline">{cfg.emergencyAt ? fmtDate(cfg.emergencyAt, true) : "—"}</dd></div>
              <div className="sm:col-span-2"><dt className="inline font-semibold">Reason: </dt><dd className="inline break-words">{cfg.emergencyReason || "—"}</dd></div>
              <div><dt className="inline font-semibold">Last changed: </dt><dd className="inline">{cfg.updatedAt ? `${fmtDate(cfg.updatedAt, true)} by ${name(cfg.updatedById)}` : "—"}</dd></div>
            </dl>
          </div>
          {canConfigure && showResumeLink && (
            <Link href="/admin/ai/settings#emergency" className="btn inline-flex h-9 shrink-0 items-center bg-red-600 px-3.5 text-[13px] text-white hover:bg-red-700">
              Resume AI workforce
            </Link>
          )}
        </div>
      </div>
    );
  }
  if (!cfg.enabled || cfg.paused) {
    return (
      <div role="status" className="mb-5 flex flex-col gap-2 rounded-lg border border-amber-500 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 sm:flex-row sm:items-center sm:justify-between">
        <p><span className="font-semibold">{!cfg.enabled ? "AI workforce is switched off." : "All AI employees are paused."}</span> New AI work is blocked; queued tasks stay on hold.</p>
        {canConfigure && showResumeLink && <Link href="/admin/ai/settings" className="font-medium underline">Open Control Center</Link>}
      </div>
    );
  }
  return null;
}
