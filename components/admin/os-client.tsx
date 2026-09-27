"use client";

import { useState, type ReactNode } from "react";
import { useActionToast } from "./client";
import { FormPendingContext, useFormAction } from "./forms";

type ImportResult = { total: number; created: number; skippedDuplicates: number; invalid: { row: number; reason: string }[]; dryRun: boolean };
type ImportState = { ok?: string; error?: string; result?: ImportResult } | undefined;

/** CSV import form with an inline result report (dry run or real import). */
export function ImportForm({ action, children }: { action: (s: ImportState, f: FormData) => Promise<ImportState>; children: ReactNode }) {
  const [state, onSubmit, pending] = useFormAction(action);
  useActionToast(state);
  const r = state?.result;
  return (
    <>
      <form onSubmit={onSubmit} className="space-y-4" aria-busy={pending} encType="multipart/form-data">
        <FormPendingContext.Provider value={pending}>{children}</FormPendingContext.Provider>
      </form>
      {r && (
        <div role="status" className="mt-5 rounded-lg border border-line bg-ink-900 p-4 text-sm">
          <p className="font-semibold text-fg">{r.dryRun ? "Dry run — nothing was written" : "Import complete"}</p>
          <dl className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[["Rows", r.total], [r.dryRun ? "Would import" : "Imported", r.created], ["Duplicates skipped", r.skippedDuplicates], ["Invalid rows", r.invalid.length]].map(([k, v]) => (
              <div key={String(k)}>
                <dt className="text-xs text-dim">{k}</dt>
                <dd className="text-lg font-semibold tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
          {r.invalid.length > 0 && (
            <ul className="mt-3 max-h-48 overflow-y-auto text-xs text-red-700">
              {r.invalid.slice(0, 200).map((x) => (
                <li key={x.row}>Row {x.row}: {x.reason}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  );
}

/** Radio + checkbox table used to pick which duplicate to keep. */
export function MergeChooser({ leads, name = "primary" }: { leads: { id: string; label: string; sub: string }[]; name?: string }) {
  const [primary, setPrimary] = useState(leads[0]?.id);
  return (
    <ul className="divide-y divide-line">
      {leads.map((l) => (
        <li key={l.id} className="flex items-center gap-3 py-2 text-sm">
          <label className="flex items-center gap-1.5 text-xs text-muted">
            <input type="radio" name={name} value={l.id} checked={primary === l.id} onChange={() => setPrimary(l.id)} className="accent-[var(--color-brand-blue)]" />
            Keep
          </label>
          <label className="flex items-center gap-1.5 text-xs text-muted">
            <input type="checkbox" name="ids" value={l.id} defaultChecked disabled={primary === l.id} className="accent-[var(--color-brand-blue)]" />
            Merge
          </label>
          <span className="min-w-0 flex-1">
            <a href={`/admin/leads/${l.id}`} className="block truncate font-medium text-fg hover:text-brand-blue">{l.label}</a>
            <span className="block truncate text-xs text-dim">{l.sub}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

type SendState = { ok?: string; error?: string; link?: string } | undefined;

/** Send form for proposals: shows the one-time share link (only its hash is stored) with a copy button. */
export function SendLinkForm({ action, children }: { action: (s: SendState, f: FormData) => Promise<SendState>; children: ReactNode }) {
  const [state, onSubmit, pending] = useFormAction(action);
  useActionToast(state);
  const [copied, setCopied] = useState(false);
  return (
    <>
      <form onSubmit={onSubmit} className="space-y-3" aria-busy={pending}>
        <FormPendingContext.Provider value={pending}>{children}</FormPendingContext.Provider>
      </form>
      {state?.link && (
        <div className="mt-3 rounded-md border border-emerald-500/40 bg-emerald-500/5 p-3 text-sm">
          <p className="font-medium text-fg">Client link (shown once — copy it now)</p>
          <div className="mt-1.5 flex gap-2">
            <input readOnly value={state.link} aria-label="Share link" className="h-8 min-w-0 flex-1 rounded border border-line bg-ink-900 px-2 font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
            <button type="button" className="btn-secondary h-8 px-2.5 text-xs" onClick={() => { void navigator.clipboard.writeText(state.link!).then(() => setCopied(true)); }}>{copied ? "Copied" : "Copy"}</button>
          </div>
          <p className="mt-1 text-xs text-dim">Generating a new link disables this one.</p>
        </div>
      )}
    </>
  );
}
