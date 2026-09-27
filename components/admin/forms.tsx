"use client";

import { createContext, startTransition, useActionState, useCallback, useContext, useEffect, useRef, type FormEvent, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { useActionToast } from "./client";

/** Pending state for SubmitButton when the form is submitted via onSubmit (see useFormAction). */
export const FormPendingContext = createContext(false);
export const useFormPending = () => useContext(FormPendingContext);

/**
 * Runs a server action from onSubmit instead of <form action>. React 19 resets uncontrolled fields
 * after a form action completes, which would wipe what the user typed when validation fails.
 */
export function useFormAction<S extends object | undefined>(action: (s: S, f: FormData) => Promise<S>) {
  const [state, run, pending] = useActionState<S, FormData>(action, undefined as Awaited<S>);
  const onSubmit = useCallback(
    (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
      startTransition(() => run(fd));
    },
    [run],
  );
  return [state, onSubmit, pending] as const;
}

export type FormResult = { ok?: string; error?: string; fieldErrors?: Record<string, string>; redirect?: string } | undefined;

/**
 * Wraps a server action in a form with pending state, toast feedback and inline field errors.
 * Field errors are rendered next to inputs via <FieldError name="…" /> placed inside the form.
 */
export function ActionForm({ action, children, className, resetOnOk, id }: { action: (s: FormResult, f: FormData) => Promise<FormResult>; children: ReactNode; className?: string; resetOnOk?: boolean; id?: string }) {
  const [state, onSubmit, pending] = useFormAction(action);
  const ref = useRef<HTMLFormElement>(null);
  useActionToast(state);
  useEffect(() => {
    if (state?.ok && resetOnOk) ref.current?.reset();
    if (state?.redirect) window.location.assign(state.redirect);
    if (state?.fieldErrors && ref.current) {
      for (const el of Array.from(ref.current.querySelectorAll<HTMLElement>("[data-field-error]"))) {
        const msg = state.fieldErrors[el.dataset.fieldError!];
        el.textContent = msg ?? "";
        el.hidden = !msg;
      }
      const first = Object.keys(state.fieldErrors)[0];
      if (first) ref.current.querySelector<HTMLElement>(`[name="${CSS.escape(first)}"]`)?.focus();
    } else if (ref.current) {
      for (const el of Array.from(ref.current.querySelectorAll<HTMLElement>("[data-field-error]"))) el.hidden = true;
    }
  }, [state, resetOnOk]);
  return (
    <form ref={ref} id={id} onSubmit={onSubmit} className={className} noValidate aria-busy={pending}>
      <FormPendingContext.Provider value={pending}>{children}</FormPendingContext.Provider>
    </form>
  );
}

export function FieldError({ name }: { name: string }) {
  return <p data-field-error={name} hidden role="alert" className="mt-1 text-xs text-red-700" />;
}

/** Checkbox that toggles every row checkbox bound to the given form id. */
export function SelectAll({ form }: { form: string }) {
  return (
    <input
      type="checkbox"
      aria-label="Select all rows on this page"
      className="size-4 accent-[var(--color-brand-blue)]"
      onChange={(e) => {
        for (const el of Array.from(document.querySelectorAll<HTMLInputElement>(`input[type=checkbox][form="${form}"][name=ids]`))) el.checked = e.currentTarget.checked;
      }}
    />
  );
}

/** Two-level select for bulk operations: the value list depends on the chosen operation. */
export function BulkControls({ statuses, priorities, users, canAssign, canArchive, canEdit, archived }: { statuses: readonly string[]; priorities: readonly string[]; users: { id: string; name: string }[]; canAssign: boolean; canArchive: boolean; canEdit: boolean; archived: boolean }) {
  const opRef = useRef<HTMLSelectElement>(null);
  const valRef = useRef<HTMLSelectElement>(null);
  const options: Record<string, [string, string][]> = {
    status: statuses.map((s) => [s, s.replace(/_/g, " ").toLowerCase()]),
    priority: priorities.map((p) => [p, p.toLowerCase()]),
    assign: [["unassigned", "Unassigned"], ...users.map((u) => [u.id, u.name] as [string, string])],
    archive: [],
    unarchive: [],
  };
  const sync = () => {
    const op = opRef.current?.value ?? "";
    const sel = valRef.current;
    if (!sel) return;
    sel.replaceChildren(...(options[op] ?? []).map(([v, l]) => new Option(l, v)));
    sel.hidden = !(options[op] ?? []).length;
  };
  useEffect(sync);
  const cls = "h-8 rounded-md border border-line-strong bg-ink-900 px-2 text-[13px] text-fg";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-dim">With selected:</span>
      <select ref={opRef} name="op" aria-label="Bulk action" className={cls} onChange={sync} defaultValue={canEdit ? "status" : canAssign ? "assign" : archived ? "unarchive" : "archive"}>
        {canEdit && <option value="status">Set status</option>}
        {canEdit && <option value="priority">Set priority</option>}
        {canAssign && <option value="assign">Assign to</option>}
        {canArchive && !archived && <option value="archive">Archive</option>}
        {canArchive && archived && <option value="unarchive">Restore</option>}
      </select>
      <select ref={valRef} name="value" aria-label="Bulk value" className={cn(cls, "capitalize")} />
      <button type="submit" className="btn-secondary h-8 px-3 text-[13px]">
        Apply
      </button>
    </div>
  );
}
