"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { CheckCircle2, Loader2, Menu, Search, X, XCircle } from "lucide-react";
import { cn } from "@/lib/cn";
import { AdminIcon } from "./icons";
import { useFormPending } from "./forms";

/* ───────── toasts ───────── */

type Toast = { id: number; kind: "ok" | "error"; text: string };
const ToastCtx = createContext<(kind: Toast["kind"], text: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function Toaster({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((kind: Toast["kind"], text: string) => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, kind, text }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), 4200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <FlashFromQuery push={push} />
      <div aria-live="polite" className="pointer-events-none fixed right-4 bottom-4 z-[80] flex w-[min(92vw,360px)] flex-col gap-2">
        {items.map((t) => (
          <div key={t.id} role="status" className={cn("pointer-events-auto flex items-start gap-2.5 rounded-lg border bg-ink-900 px-3.5 py-3 text-sm shadow-[0_12px_30px_-12px_rgb(11_20_36/0.35)]", t.kind === "ok" ? "border-emerald-500/40" : "border-red-500/40")}>
            {t.kind === "ok" ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" /> : <XCircle className="mt-0.5 size-4 shrink-0 text-red-600" />}
            <span className="text-fg">{t.text}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/** Shows ?toast=… once after a server redirect, then removes it from the URL. */
function FlashFromQuery({ push }: { push: (k: Toast["kind"], t: string) => void }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    const t = params.get("toast");
    if (!t) return;
    push(params.get("toastKind") === "error" ? "error" : "ok", t.slice(0, 200));
    const next = new URLSearchParams(params);
    next.delete("toast");
    next.delete("toastKind");
    router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
  }, [params, push, router, pathname]);
  return null;
}

/** Reports a server action result as a toast. */
export function useActionToast(state: { ok?: string; error?: string } | undefined) {
  const toast = useToast();
  const last = useRef<typeof state>(undefined);
  useEffect(() => {
    if (!state || state === last.current) return;
    last.current = state;
    if (state.error) toast("error", state.error);
    else if (state.ok) toast("ok", state.ok);
  }, [state, toast]);
}

/* ───────── buttons ───────── */

export function SubmitButton({ children, className, variant = "primary", name, value, formAction }: { children: ReactNode; className?: string; variant?: "primary" | "secondary" | "danger"; name?: string; value?: string; formAction?: (fd: FormData) => void }) {
  const status = useFormStatus();
  const ctxPending = useFormPending();
  const pending = status.pending || ctxPending;
  return (
    <button type="submit" name={name} value={value} formAction={formAction} disabled={pending} className={cn(variant === "primary" ? "btn-primary" : variant === "danger" ? "btn inline-flex h-11 bg-red-600 text-white hover:bg-red-700" : "btn-secondary", "h-9 px-3.5 text-[13px] disabled:opacity-60", className)}>
      {pending && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

/** Button that asks for confirmation in an accessible <dialog> before submitting its form. */
export function ConfirmButton({ children, message, confirmLabel = "Confirm", className, danger = true }: { children: ReactNode; message: string; confirmLabel?: string; className?: string; danger?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button type="button" onClick={() => ref.current?.showModal()} className={cn("btn-secondary h-9 px-3 text-[13px]", danger && "text-red-700 hover:border-red-400", className)}>
        {children}
      </button>
      <dialog ref={ref} className="m-auto w-[min(92vw,420px)] rounded-xl border border-line bg-ink-900 p-0 text-fg backdrop:bg-black/40">
        <div className="p-5">
          <p className="text-sm font-semibold">Are you sure?</p>
          <p className="mt-1.5 text-sm text-muted">{message}</p>
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
          <button type="button" className="btn-secondary h-9 px-3 text-[13px]" onClick={() => ref.current?.close()}>
            Cancel
          </button>
          <button ref={btn} type="submit" onClick={() => ref.current?.close()} className={cn("btn h-9 px-3 text-[13px] text-white", danger ? "bg-red-600 hover:bg-red-700" : "bg-[var(--btn-bg)] hover:bg-[var(--btn-bg-hover)]")}>
            {confirmLabel}
          </button>
        </div>
      </dialog>
    </>
  );
}

/** Submits the closest GET filter form whenever a control changes. */
export function AutoSubmit() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const form = ref.current?.closest("form");
    if (!form) return;
    const onChange = (e: Event) => {
      if ((e.target as HTMLElement).tagName === "SELECT" || (e.target as HTMLInputElement).type === "date") form.requestSubmit();
    };
    form.addEventListener("change", onChange);
    return () => form.removeEventListener("change", onChange);
  }, []);
  return <span ref={ref} hidden />;
}

/* ───────── navigation ───────── */

export interface NavGroup {
  title?: string;
  items: { label: string; href: string; icon: string }[];
}

export function SidebarNav({ groups, footer }: { groups: NavGroup[]; footer: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [prev, setPrev] = useState(pathname);
  if (prev !== pathname) {
    setPrev(pathname);
    setOpen(false);
  }
  const nav = (
    <nav aria-label="Admin" className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
      {groups.map((g, i) => (
        <div key={g.title ?? i}>
          {g.title && <p className="mb-1.5 px-2 font-mono text-[10.5px] tracking-[0.08em] text-dim uppercase">{g.title}</p>}
          <ul className="space-y-0.5">
            {g.items.map((it) => {
              const active = pathname === it.href || pathname.startsWith(`${it.href}/`);
              return (
                <li key={it.href}>
                  <Link href={it.href} aria-current={active ? "page" : undefined} className={cn("flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13.5px] transition-colors", active ? "bg-ink-800 font-medium text-fg" : "text-muted hover:bg-ink-850 hover:text-fg")}>
                    <AdminIcon name={it.icon} className="size-4 shrink-0" />
                    {it.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="flex size-9 items-center justify-center rounded-md border border-line text-fg lg:hidden" aria-label="Open navigation">
        <Menu className="size-4" />
      </button>
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-line bg-ink-900 lg:flex">
        <Brand />
        {nav}
        <div className="border-t border-line p-3">{footer}</div>
      </aside>
      {open && (
        <div className="fixed inset-0 z-[60] lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <button type="button" aria-label="Close navigation" className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-[min(84vw,300px)] flex-col border-r border-line bg-ink-900">
            <div className="flex items-center justify-between pr-3">
              <Brand />
              <button type="button" onClick={() => setOpen(false)} className="flex size-9 items-center justify-center rounded-md border border-line" aria-label="Close navigation">
                <X className="size-4" />
              </button>
            </div>
            {nav}
            <div className="border-t border-line p-3">{footer}</div>
          </aside>
        </div>
      )}
    </>
  );
}

function Brand() {
  return (
    <Link href="/admin/dashboard" className="flex h-14 items-center gap-2.5 px-5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/shivacha-mark.svg" alt="" className="size-6" />
      <span className="text-[14px] font-semibold tracking-tight text-fg">
        Shivacha <span className="font-normal text-muted">Admin</span>
      </span>
    </Link>
  );
}

/* ───────── global search (⌘K) ───────── */

export type SearchHit = { type: string; label: string; sub?: string; href: string };

export function GlobalSearch({ search }: { search: (q: string) => Promise<SearchHit[]> }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    if (!open || q.trim().length < 2) return;
    let alive = true;
    const t = setTimeout(async () => {
      setLoading(true);
      const r = await search(q.trim()).catch(() => []);
      if (alive) {
        setHits(r);
        setLoading(false);
      }
    }, 200);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q, open, search]);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="flex h-9 w-full max-w-sm items-center gap-2 rounded-md border border-line bg-ink-900 px-2.5 text-sm text-dim hover:border-line-strong">
        <Search className="size-4" aria-hidden />
        <span className="flex-1 truncate text-left">Search leads, content…</span>
        <kbd className="hidden rounded border border-line px-1.5 font-mono text-[10.5px] sm:inline">⌘K</kbd>
      </button>
      {open && (
        <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/40 px-4 pt-[12vh]" onMouseDown={() => setOpen(false)}>
          <div role="dialog" aria-label="Search" className="w-full max-w-lg overflow-hidden rounded-xl border border-line bg-ink-900 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 border-b border-line px-3">
              <Search className="size-4 text-dim" aria-hidden />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search leads, services, products, pages, blog…" className="h-12 flex-1 bg-transparent text-sm text-fg outline-none" aria-label="Search query" />
              {loading && <Loader2 className="size-4 animate-spin text-dim" />}
            </div>
            <ul className="max-h-[50vh] overflow-y-auto p-1.5">
              {q.trim().length < 2 ? (
                <li className="px-3 py-6 text-center text-sm text-dim">Type at least two characters.</li>
              ) : hits.length === 0 && !loading ? (
                <li className="px-3 py-6 text-center text-sm text-dim">No results.</li>
              ) : (
                hits.map((h) => (
                  <li key={h.href}>
                    <button type="button" onClick={() => { setOpen(false); router.push(h.href); }} className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left hover:bg-ink-850">
                      <span className="w-20 shrink-0 font-mono text-[10.5px] text-dim uppercase">{h.type}</span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm text-fg">{h.label}</span>
                        {h.sub && <span className="block truncate text-xs text-dim">{h.sub}</span>}
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
