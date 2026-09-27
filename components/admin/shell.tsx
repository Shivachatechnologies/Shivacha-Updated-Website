"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Bell, Bot, ChevronDown, ChevronRight, ExternalLink, LogOut, Menu, PanelLeftClose, PanelLeftOpen, Plus, Sparkles, User, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { AdminIcon } from "./icons";
import { GlobalSearch, type SearchHit } from "./client";

export interface ShellNavGroup {
  title?: string;
  icon?: string;
  items: { label: string; href: string; icon: string }[];
}

export interface ShellProps {
  groups: ShellNavGroup[];
  user: { name: string; role: string };
  status: {
    env: "Production" | "Preview" | "Development";
    db: { ok: boolean; ms: number | null };
    ai: { connected: boolean; enabled: boolean; running: number; pendingApprovals: number };
    activeUsers: number;
    unread: number;
  };
  badges: Record<string, number>;
  quickCreate: { label: string; href: string; icon: string }[];
  initialCollapsed: boolean;
  search: (q: string) => Promise<SearchHit[]>;
  canAskAI: boolean;
  logout: () => Promise<void>;
  children: ReactNode;
}

const COOKIE = "os_sidebar";
const AI_GROUP = "AI Workforce";

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("") || "U";

/** Shivacha OS application shell: dark navigation rail, command bar and live status strip. */
export function AdminShell({ groups, user, status, badges, quickCreate, initialCollapsed, search, canAskAI, logout, children }: ShellProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [drawer, setDrawer] = useState(false);
  const [prevPath, setPrevPath] = useState(pathname);
  if (prevPath !== pathname) {
    setPrevPath(pathname);
    setDrawer(false);
  }
  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `${COOKIE}=${next ? 1 : 0}; path=/admin; max-age=31536000; samesite=lax`;
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      if ((e.metaKey || e.ctrlKey) && e.key === "\\") {
        e.preventDefault();
        setCollapsed((c) => {
          document.cookie = `${COOKIE}=${c ? 0 : 1}; path=/admin; max-age=31536000; samesite=lax`;
          return !c;
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // The most specific matching item is active (so /admin/ai/agents does not also light up /admin/ai).
  const all = groups.flatMap((g) => g.items.map((i) => ({ ...i, group: g.title })));
  const active = all.filter((i) => pathname === i.href || pathname.startsWith(`${i.href}/`)).sort((a, b) => b.href.length - a.href.length)[0];

  return (
    <div className={cn("min-h-screen transition-[padding] duration-200", collapsed ? "lg:pl-[68px]" : "lg:pl-[248px]")}>
      <aside data-theme="dark" className={cn("os-rail fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-white/[0.06] text-fg transition-[width] duration-200 lg:flex", collapsed ? "w-[68px]" : "w-[248px]")}>
        <RailBrand collapsed={collapsed} onToggle={toggle} />
        {collapsed ? <CollapsedNav groups={groups} activeHref={active?.href} badges={badges} aiRunning={status.ai.running} /> : <ExpandedNav groups={groups} activeHref={active?.href} badges={badges} aiRunning={status.ai.running} />}
        <RailFooter collapsed={collapsed} user={user} status={status} logout={logout} onExpand={toggle} />
      </aside>

      {drawer && (
        <div className="fixed inset-0 z-[60] lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <button type="button" aria-label="Close navigation" className="absolute inset-0 bg-black/50" onClick={() => setDrawer(false)} />
          <aside data-theme="dark" className="os-rail absolute inset-y-0 left-0 flex w-[min(86vw,300px)] flex-col text-fg">
            <div className="flex items-center justify-between pr-3">
              <RailBrand collapsed={false} />
              <button type="button" onClick={() => setDrawer(false)} className="flex size-8 items-center justify-center rounded-md border border-line text-muted hover:text-fg" aria-label="Close navigation">
                <X className="size-4" />
              </button>
            </div>
            <ExpandedNav groups={groups} activeHref={active?.href} badges={badges} aiRunning={status.ai.running} />
            <RailFooter collapsed={false} user={user} status={status} logout={logout} />
          </aside>
        </div>
      )}

      {/* No backdrop-filter on the header: it would become the containing block of fixed overlays inside it. */}
      <header className="sticky top-0 z-30 border-b border-line bg-ink-900 shadow-[0_1px_0_rgb(11_20_36/0.02),0_8px_24px_-18px_rgb(11_20_36/0.25)]">
        <div className="flex h-14 items-center gap-2 px-3 sm:gap-3 sm:px-5">
          <button type="button" onClick={() => setDrawer(true)} className="flex size-9 shrink-0 items-center justify-center rounded-md border border-line text-fg lg:hidden" aria-label="Open navigation">
            <Menu className="size-4" />
          </button>
          <Breadcrumbs group={active?.group} item={active} pathname={pathname} />
          <div className="mx-auto w-full min-w-0 max-w-md flex-1">
            <GlobalSearch search={search} ai={canAskAI} />
          </div>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <EnvBadge env={status.env} />
            <HealthDot status={status} />
            {status.ai.enabled && <AIIndicator running={status.ai.running} pending={status.ai.pendingApprovals} connected={status.ai.connected} />}
            <Link href="/admin/notifications" className="relative flex size-9 items-center justify-center rounded-md border border-line text-muted transition-colors hover:border-line-strong hover:text-fg" aria-label={status.unread ? `${status.unread} unread notifications` : "Notifications"}>
              <Bell className="size-4" aria-hidden />
              {status.unread > 0 && <span className="absolute -top-1 -right-1 min-w-4 rounded-full bg-red-600 px-1 text-center text-[10px] leading-4 font-semibold text-white">{status.unread > 99 ? "99+" : status.unread}</span>}
            </Link>
            {quickCreate.length > 0 && <QuickCreate items={quickCreate} />}
            <Clock />
            <UserMenu user={user} logout={logout} />
          </div>
        </div>
        <StatusStrip status={status} />
      </header>

      <main id="admin-main" className="mx-auto w-full max-w-[1480px] px-4 py-6 sm:px-6 lg:py-7">{children}</main>
    </div>
  );
}

/* ───────── rail ───────── */

function RailBrand({ collapsed, onToggle }: { collapsed: boolean; onToggle?: () => void }) {
  return (
    <div className={cn("flex h-14 shrink-0 items-center border-b border-white/[0.06]", collapsed ? "justify-center px-2" : "justify-between gap-2 pr-2.5 pl-4")}>
      <Link href="/admin/dashboard" className="flex min-w-0 items-center gap-2.5" aria-label="Shivacha OS home">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/shivacha-mark.svg" alt="" className="size-7 shrink-0" />
        {!collapsed && (
          <span className="min-w-0 leading-tight">
            <span className="block truncate text-[14px] font-semibold tracking-[-0.01em] text-fg">Shivacha</span>
            <span className="block font-mono text-[9.5px] tracking-[0.22em] text-dim uppercase">Operating System</span>
          </span>
        )}
      </Link>
      {onToggle && !collapsed && (
        <button type="button" onClick={onToggle} className="flex size-7 items-center justify-center rounded-md text-dim transition-colors hover:bg-white/[0.06] hover:text-fg" aria-label="Collapse sidebar" title="Collapse sidebar (Ctrl+\)">
          <PanelLeftClose className="size-4" />
        </button>
      )}
    </div>
  );
}

const groupBadge = (g: ShellNavGroup, badges: Record<string, number>) => g.items.reduce((n, i) => n + (badges[i.href] ?? 0), 0);

function NavBadge({ n, ai }: { n: number; ai?: boolean }) {
  if (!n) return null;
  return <span className={cn("ml-auto min-w-5 rounded-full px-1.5 text-center font-mono text-[10px] leading-[18px] font-semibold tabular-nums", ai ? "bg-violet-500/25 text-violet-200" : "bg-amber-400/20 text-amber-200")}>{n > 99 ? "99+" : n}</span>;
}

function ExpandedNav({ groups, activeHref, badges, aiRunning }: { groups: ShellNavGroup[]; activeHref?: string; badges: Record<string, number>; aiRunning: number }) {
  return (
    <nav aria-label="Admin" className="os-scroll flex-1 space-y-0.5 overflow-y-auto px-2.5 py-3">
      {groups.map((g, gi) => {
        const ai = g.title === AI_GROUP;
        const hasActive = g.items.some((it) => it.href === activeHref);
        const nested = !!g.title && g.title !== "Overview";
        const list = (
          <ul className={cn("space-y-px pb-1.5", nested && "mt-0.5 ml-[15px] border-l border-white/[0.07] pl-2")}>
            {g.items.map((it) => {
              const on = it.href === activeHref;
              return (
                <li key={it.href}>
                  <Link
                    href={it.href}
                    aria-current={on ? "page" : undefined}
                    className={cn(
                      "group/item relative flex items-center gap-2.5 rounded-md py-[7px] pr-2 pl-2.5 text-[13px] transition-colors",
                      on ? (ai ? "bg-violet-500/[0.14] font-medium text-white" : "bg-white/[0.07] font-medium text-white") : "text-[#a3aec2] hover:bg-white/[0.04] hover:text-white",
                    )}
                  >
                    {on && <span aria-hidden className={cn("absolute top-1.5 bottom-1.5 w-[3px]", nested ? "-left-[10px] rounded-full" : "-left-2.5 rounded-r-full", ai ? "bg-violet-400" : "bg-brand-blue")} />}
                    <AdminIcon name={it.icon} className={cn("size-[15px] shrink-0", on ? (ai ? "text-violet-300" : "text-brand-sky") : "text-[#7d889c] group-hover/item:text-[#c9d2e0]")} />
                    <span className="truncate">{it.label}</span>
                    <NavBadge n={badges[it.href] ?? 0} ai={ai} />
                  </Link>
                </li>
              );
            })}
          </ul>
        );
        if (!g.title || g.title === "Overview") return <div key={g.title ?? gi}>{list}</div>;
        const n = groupBadge(g, badges);
        return (
          <details key={g.title} open={hasActive || undefined} className={cn("group/nav", ai && "os-ai-group my-1.5 rounded-lg border border-violet-400/15 bg-gradient-to-b from-violet-500/[0.07] to-transparent px-1 pb-0.5")}>
            <summary className={cn("flex cursor-pointer list-none items-center gap-2 rounded-md px-2 py-1.5 select-none [&::-webkit-details-marker]:hidden", ai ? "text-violet-200 hover:text-white" : "text-[#93a0b5] hover:text-white")}>
              {ai ? <Sparkles className="size-[15px] shrink-0" aria-hidden /> : g.icon ? <AdminIcon name={g.icon} className="size-[15px] shrink-0 opacity-80" /> : null}
              <span className={cn("text-[12.5px] font-medium", ai && "font-semibold tracking-[0.01em]")}>{g.title}</span>
              {ai && aiRunning > 0 && <span className="os-pulse size-1.5 rounded-full bg-violet-300" aria-label={`${aiRunning} agents running`} />}
              {n > 0 && <span className="ml-auto group-open/nav:hidden"><NavBadge n={n} ai={ai} /></span>}
              <ChevronRight className={cn("size-3 shrink-0 transition-transform group-open/nav:rotate-90", n > 0 ? "group-open/nav:ml-auto" : "ml-auto")} aria-hidden />
            </summary>
            {list}
          </details>
        );
      })}
    </nav>
  );
}

/** Icon-only rail: one icon per module; hovering or focusing it opens a flyout with the module's pages. */
function CollapsedNav({ groups, activeHref, badges, aiRunning }: { groups: ShellNavGroup[]; activeHref?: string; badges: Record<string, number>; aiRunning: number }) {
  const [fly, setFly] = useState<{ gi: number; top: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const open = (gi: number, el: HTMLElement) => {
    if (timer.current) clearTimeout(timer.current);
    setFly({ gi, top: el.getBoundingClientRect().top });
  };
  const close = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setFly(null), 120);
  };
  type Entry = { kind: "item"; gi: number; it: ShellNavGroup["items"][number] } | { kind: "group"; gi: number; g: ShellNavGroup };
  const entries = groups.flatMap((g, gi): Entry[] => (!g.title || g.title === "Overview" ? g.items.map((it) => ({ kind: "item", gi, it })) : [{ kind: "group", gi, g }]));
  const flyGroup = fly ? groups[fly.gi] : null;
  return (
    <nav aria-label="Admin" className="os-scroll flex-1 overflow-y-auto px-2.5 py-3" onScroll={() => setFly(null)}>
      <ul className="space-y-1">
        {entries.map((e) => {
          if (e.kind === "item") {
            const on = e.it.href === activeHref;
            const n = badges[e.it.href] ?? 0;
            return (
              <li key={e.it.href}>
                <Link href={e.it.href} aria-label={e.it.label} title={e.it.label} aria-current={on ? "page" : undefined} className={cn("relative flex h-10 w-full items-center justify-center rounded-md transition-colors", on ? "bg-white/[0.08] text-white" : "text-[#8b97ab] hover:bg-white/[0.05] hover:text-white")}>
                  <AdminIcon name={e.it.icon} className="size-[18px]" />
                  {n > 0 && <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-amber-400" aria-hidden />}
                </Link>
              </li>
            );
          }
          const g = e.g;
          const ai = g.title === AI_GROUP;
          const on = g.items.some((it) => it.href === activeHref);
          const n = groupBadge(g, badges);
          return (
            <li key={g.title} onMouseEnter={(ev) => open(e.gi, ev.currentTarget)} onMouseLeave={close}>
              <Link href={g.items[0]!.href} aria-label={g.title} onFocus={(ev) => open(e.gi, ev.currentTarget)} onBlur={close} className={cn("relative flex h-10 w-full items-center justify-center rounded-md transition-colors", on ? (ai ? "bg-violet-500/20 text-violet-100" : "bg-white/[0.08] text-white") : ai ? "text-violet-300 hover:bg-violet-500/15" : "text-[#8b97ab] hover:bg-white/[0.05] hover:text-white", ai && "ring-1 ring-violet-400/25")}>
                {on && <span aria-hidden className={cn("absolute top-2 bottom-2 -left-2.5 w-[3px] rounded-r-full", ai ? "bg-violet-400" : "bg-brand-blue")} />}
                <AdminIcon name={g.icon ?? g.items[0]!.icon} className="size-[18px]" />
                {ai && aiRunning > 0 && <span className="os-pulse absolute right-1.5 bottom-1.5 size-1.5 rounded-full bg-violet-300" aria-hidden />}
                {n > 0 && <span className={cn("absolute top-1.5 right-1.5 size-2 rounded-full", ai ? "bg-violet-300" : "bg-amber-400")} aria-hidden />}
              </Link>
            </li>
          );
        })}
      </ul>
      {fly && flyGroup && (
        <div
          role="menu"
          aria-label={flyGroup.title}
          onMouseEnter={() => timer.current && clearTimeout(timer.current)}
          onMouseLeave={close}
          style={{ top: Math.min(fly.top - 6, (typeof window !== "undefined" ? window.innerHeight : 800) - (flyGroup.items.length * 34 + 52)) }}
          className="fixed left-[64px] z-50 w-56 rounded-lg border border-white/10 bg-[#0b1626] p-1.5 shadow-[0_18px_40px_-12px_rgb(0_0_0/0.6)]"
        >
          <p className={cn("px-2 pt-1 pb-1.5 font-mono text-[10px] tracking-[0.14em] uppercase", flyGroup.title === AI_GROUP ? "text-violet-300" : "text-dim")}>{flyGroup.title}</p>
          {flyGroup.items.map((it) => (
            <Link key={it.href} role="menuitem" href={it.href} onClick={() => setFly(null)} className={cn("flex items-center gap-2.5 rounded-md px-2 py-[7px] text-[13px]", it.href === activeHref ? "bg-white/[0.08] text-white" : "text-[#a3aec2] hover:bg-white/[0.05] hover:text-white")}>
              <AdminIcon name={it.icon} className="size-[15px] shrink-0" />
              <span className="truncate">{it.label}</span>
              <NavBadge n={badges[it.href] ?? 0} ai={flyGroup.title === AI_GROUP} />
            </Link>
          ))}
        </div>
      )}
    </nav>
  );
}

function RailFooter({ collapsed, user, status, logout, onExpand }: { collapsed: boolean; user: ShellProps["user"]; status: ShellProps["status"]; logout: () => Promise<void>; onExpand?: () => void }) {
  const ok = status.db.ok;
  return (
    <div className="shrink-0 border-t border-white/[0.06] p-2.5">
      {collapsed ? (
        <div className="flex flex-col items-center gap-2">
          {onExpand && (
            <button type="button" onClick={onExpand} className="flex size-9 items-center justify-center rounded-md text-dim transition-colors hover:bg-white/[0.06] hover:text-fg" aria-label="Expand sidebar" title="Expand sidebar (Ctrl+\)">
              <PanelLeftOpen className="size-4" />
            </button>
          )}
          <Link href="/admin/system" title={ok ? "All systems operational" : "Database unreachable"} className="flex size-8 items-center justify-center" aria-label="System health">
            <span className={cn("size-2 rounded-full", ok ? "os-pulse bg-emerald-400" : "bg-red-500")} />
          </Link>
          <Link href="/admin/account" title={`${user.name} · ${user.role}`} className="flex size-9 items-center justify-center rounded-full bg-gradient-to-br from-[#1d3a5f] to-[#0e1c30] text-[12px] font-semibold text-white ring-1 ring-white/10">
            {initials(user.name)}
          </Link>
        </div>
      ) : (
        <>
          <Link href="/admin/system" className="mb-2 flex items-center gap-2 rounded-md border border-white/[0.06] bg-white/[0.02] px-2.5 py-2 transition-colors hover:border-white/10">
            <span className={cn("size-2 shrink-0 rounded-full", ok ? "os-pulse bg-emerald-400" : "bg-red-500")} aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12px] font-medium text-fg">{ok ? "All systems operational" : "Database unreachable"}</span>
              <span className="block truncate font-mono text-[10px] text-dim">
                DB {ok ? `${status.db.ms ?? "–"} ms` : "down"} · AI {status.ai.connected ? "online" : "offline"}
              </span>
            </span>
          </Link>
          <div className="flex items-center gap-2.5 rounded-md px-1 py-1">
            <Link href="/admin/account" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#1d3a5f] to-[#0e1c30] text-[12px] font-semibold text-white ring-1 ring-white/10">
              {initials(user.name)}
            </Link>
            <div className="min-w-0 flex-1">
              <Link href="/admin/account" className="block truncate text-[13px] font-medium text-fg hover:underline">{user.name}</Link>
              <p className="truncate text-[11px] text-dim">{user.role}</p>
            </div>
            <form action={logout}>
              <button type="submit" className="flex size-8 items-center justify-center rounded-md text-dim transition-colors hover:bg-white/[0.06] hover:text-fg" aria-label="Sign out" title="Sign out">
                <LogOut className="size-4" />
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}

/* ───────── top bar ───────── */

function Breadcrumbs({ group, item, pathname }: { group?: string; item?: { label: string; href: string }; pathname: string }) {
  const rest = item && pathname !== item.href ? pathname.slice(item.href.length + 1).split("/")[0] : "";
  const tail = rest === "new" ? "New" : rest ? "Details" : "";
  return (
    <nav aria-label="Breadcrumb" className="hidden min-w-0 shrink items-center gap-1.5 text-[12.5px] xl:flex">
      <Link href="/admin/dashboard" className="shrink-0 font-medium text-muted hover:text-fg">Shivacha OS</Link>
      {group && group !== "Overview" && (
        <>
          <ChevronRight className="size-3 shrink-0 text-dim" aria-hidden />
          <span className="shrink-0 text-dim">{group}</span>
        </>
      )}
      {item && (
        <>
          <ChevronRight className="size-3 shrink-0 text-dim" aria-hidden />
          {tail ? <Link href={item.href} className="truncate text-muted hover:text-fg">{item.label}</Link> : <span className="truncate font-medium text-fg" aria-current="page">{item.label}</span>}
        </>
      )}
      {tail && (
        <>
          <ChevronRight className="size-3 shrink-0 text-dim" aria-hidden />
          <span className="shrink-0 font-medium text-fg" aria-current="page">{tail}</span>
        </>
      )}
    </nav>
  );
}

function EnvBadge({ env }: { env: ShellProps["status"]["env"] }) {
  const tone = env === "Production" ? "border-emerald-600/25 bg-emerald-500/[0.08] text-emerald-800" : env === "Preview" ? "border-amber-500/30 bg-amber-500/10 text-amber-800" : "border-line-strong bg-ink-850 text-muted";
  return (
    <span className={cn("hidden h-7 items-center gap-1.5 rounded-md border px-2 font-mono text-[10.5px] font-medium tracking-[0.08em] uppercase md:inline-flex", tone)} title="Deployment environment">
      <span className={cn("size-1.5 rounded-full", env === "Production" ? "bg-emerald-500" : env === "Preview" ? "bg-amber-500" : "bg-dim")} aria-hidden />
      {env}
    </span>
  );
}

function HealthDot({ status }: { status: ShellProps["status"] }) {
  const ok = status.db.ok;
  return (
    <Link href="/admin/system" className="hidden size-9 items-center justify-center rounded-md border border-line transition-colors hover:border-line-strong sm:flex" aria-label={ok ? "System health: operational" : "System health: database unreachable"} title={ok ? `System operational · DB ${status.db.ms} ms` : "Database unreachable"}>
      <span className="relative flex size-2.5">
        {ok && <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/60 [animation-duration:2.4s]" />}
        <span className={cn("relative size-2.5 rounded-full", ok ? "bg-emerald-500" : "bg-red-500")} />
      </span>
    </Link>
  );
}

function AIIndicator({ running, pending, connected }: { running: number; pending: number; connected: boolean }) {
  const label = !connected ? "AI provider not connected" : running ? `${running} agent run${running === 1 ? "" : "s"} in progress` : pending ? `${pending} AI action${pending === 1 ? "" : "s"} awaiting approval` : "AI workforce idle";
  return (
    <Link href={pending ? "/admin/ai/approvals" : "/admin/ai"} className={cn("relative hidden h-9 items-center gap-1.5 rounded-md border px-2.5 text-[12px] font-medium transition-colors sm:flex", running ? "border-violet-500/40 bg-violet-500/[0.07] text-violet-800" : "border-line text-muted hover:border-line-strong hover:text-fg")} aria-label={label} title={label}>
      <Bot className="size-4" aria-hidden />
      {running > 0 ? (
        <>
          <span className="os-eq" aria-hidden><i /><i /><i /></span>
          <span className="tabular-nums">{running}</span>
        </>
      ) : pending > 0 ? (
        <span className="rounded bg-amber-500/15 px-1 font-mono text-[10.5px] text-amber-800 tabular-nums">{pending}</span>
      ) : (
        <span className={cn("size-1.5 rounded-full", connected ? "bg-violet-500" : "bg-dim")} aria-hidden />
      )}
    </Link>
  );
}

function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return { open, setOpen, ref };
}

function QuickCreate({ items }: { items: ShellProps["quickCreate"] }) {
  const { open, setOpen, ref } = usePopover();
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="menu" className="btn-primary h-9 gap-1 px-2.5 text-[13px] sm:px-3">
        <Plus className="size-4" aria-hidden />
        <span className="hidden sm:inline">Create</span>
        <ChevronDown className="hidden size-3.5 opacity-70 sm:inline" aria-hidden />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-50 mt-1.5 w-56 rounded-lg border border-line bg-ink-900 p-1.5 shadow-[0_18px_40px_-16px_rgb(11_20_36/0.4)]">
          <p className="px-2 pt-1 pb-1.5 font-mono text-[10px] tracking-[0.14em] text-dim uppercase">Quick create</p>
          {items.map((it) => (
            <Link key={it.href} role="menuitem" href={it.href} onClick={() => setOpen(false)} className="flex items-center gap-2.5 rounded-md px-2 py-2 text-[13px] text-fg hover:bg-ink-850">
              <AdminIcon name={it.icon} className="size-4 text-dim" />
              {it.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function UserMenu({ user, logout }: { user: ShellProps["user"]; logout: () => Promise<void> }) {
  const { open, setOpen, ref } = usePopover();
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="menu" aria-label="Account menu" className="flex size-9 items-center justify-center rounded-full bg-[#0e1c30] text-[12px] font-semibold text-white ring-2 ring-ink-900 transition-shadow hover:ring-brand-blue/30">
        {initials(user.name)}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-50 mt-1.5 w-60 rounded-lg border border-line bg-ink-900 p-1.5 shadow-[0_18px_40px_-16px_rgb(11_20_36/0.4)]">
          <div className="border-b border-line px-2.5 pt-1.5 pb-2.5">
            <p className="truncate text-sm font-semibold text-fg">{user.name}</p>
            <p className="truncate text-xs text-dim">{user.role}</p>
          </div>
          <Link role="menuitem" href="/admin/account" onClick={() => setOpen(false)} className="mt-1 flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] text-fg hover:bg-ink-850">
            <User className="size-4 text-dim" aria-hidden /> Account & security
          </Link>
          <a role="menuitem" href="/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] text-fg hover:bg-ink-850">
            <ExternalLink className="size-4 text-dim" aria-hidden /> View website
          </a>
          <form action={logout} className="border-t border-line pt-1">
            <button type="submit" role="menuitem" className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] text-red-700 hover:bg-red-500/[0.06]">
              <LogOut className="size-4" aria-hidden /> Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

/* ───────── clock ───────── */

const subscribeClock = (cb: () => void) => {
  const t = setInterval(cb, 15_000);
  return () => clearInterval(t);
};
const clockSnap = () => Math.floor(Date.now() / 15_000);

/** Local date and time; renders nothing on the server so it never mismatches during hydration. */
function Clock() {
  const tick = useSyncExternalStore(subscribeClock, clockSnap, () => 0);
  if (!tick) return <span className="hidden w-[92px] 2xl:block" aria-hidden />;
  const d = new Date(tick * 15_000);
  const date = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" }).format(d);
  const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZoneName: "short" }).format(d);
  return (
    <time dateTime={d.toISOString()} className="hidden w-[92px] flex-col items-end leading-tight 2xl:flex">
      <span className="font-mono text-[12px] font-medium text-fg tabular-nums">{time}</span>
      <span className="text-[10.5px] text-dim">{date}</span>
    </time>
  );
}

/* ───────── status strip ───────── */

function StatusStrip({ status }: { status: ShellProps["status"] }) {
  const sep = <span aria-hidden className="h-3 w-px bg-line-strong" />;
  return (
    <div className="os-scroll flex h-8 items-center gap-3.5 overflow-x-auto border-t border-line bg-ink-950/70 px-4 font-mono text-[10.5px] tracking-[0.02em] whitespace-nowrap text-dim sm:px-5">
      <span className="flex items-center gap-1.5">
        <span className={cn("size-1.5 rounded-full", status.db.ok ? "bg-emerald-500" : "bg-red-500")} aria-hidden />
        <span className={status.db.ok ? "text-emerald-800" : "text-red-700"}>{status.db.ok ? "System operational" : "Degraded"}</span>
      </span>
      {sep}
      <span>Database <span className="text-fg">{status.db.ok ? "connected" : "unreachable"}</span>{status.db.ok && status.db.ms != null && <span> · {status.db.ms} ms</span>}</span>
      {status.ai.enabled && (
        <>
          {sep}
          <span>AI provider <span className={status.ai.connected ? "text-fg" : "text-amber-800"}>{status.ai.connected ? "Anthropic · connected" : "not connected"}</span></span>
        </>
      )}
      {sep}
      <span title="Users with an active session in the last 2 hours">Active users <span className="text-fg tabular-nums">{status.activeUsers}</span></span>
      {status.ai.enabled && (
        <>
          {sep}
          <Link href="/admin/ai/approvals" className="hover:text-fg">
            Pending approvals <span className={cn("tabular-nums", status.ai.pendingApprovals ? "font-semibold text-amber-800" : "text-fg")}>{status.ai.pendingApprovals}</span>
          </Link>
        </>
      )}
    </div>
  );
}
