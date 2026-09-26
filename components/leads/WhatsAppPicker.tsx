"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ChevronDown, MessageCircle } from "lucide-react";
import { Flag } from "@/components/graphics/Flag";
import { track } from "@/lib/analytics";
import { suggestedLineId, whatsappHref, whatsappLines } from "@/lib/whatsapp";
import { cn } from "@/lib/cn";

const noop = () => () => {};
/** Suggested line from the visitor's time zone; "in" during server render. */
function useSuggestedLine() {
  return useSyncExternalStore(noop, suggestedLineId, () => "in");
}

function ordered(suggested: string) {
  return [...whatsappLines].sort((a, b) => (a.id === suggested ? -1 : b.id === suggested ? 1 : 0));
}

/** "Chat on WhatsApp" button that lets the visitor pick our India, USA or UK number. */
export function WhatsAppPicker({
  text,
  label = "Chat on WhatsApp",
  location,
  className,
  variant = "secondary",
  placement = "up",
}: {
  text?: string;
  label?: string;
  location: string;
  className?: string;
  variant?: "secondary" | "ghost";
  placement?: "up" | "down";
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const suggested = useSuggestedLine();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => wrap.current && !wrap.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrap} className="relative inline-flex">
      <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} className={cn(variant === "secondary" ? "btn-secondary" : "btn-ghost", className)}>
        <MessageCircle className="size-4" aria-hidden /> {label}
        <ChevronDown className={cn("size-3.5 opacity-60 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <div role="menu" aria-label="Choose a WhatsApp number" className={cn("absolute left-1/2 z-20 w-72 -translate-x-1/2 animate-[menu-in_.16s_ease-out] rounded-2xl border border-line bg-ink-900 p-2 text-left shadow-[0_24px_60px_-20px_rgb(0_0_0/0.45)]", placement === "up" ? "bottom-[calc(100%+8px)]" : "top-[calc(100%+8px)]")}>
          <p className="px-3 pt-1.5 pb-2 text-xs font-medium text-dim">Choose the nearest team</p>
          <WhatsAppLines text={text} location={location} suggested={suggested} onPick={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}

/** The three WhatsApp lines as rows (used inside menus). */
export function WhatsAppLines({ text, location, suggested, onPick, compact }: { text?: string; location: string; suggested?: string; onPick?: () => void; compact?: boolean }) {
  const auto = useSuggestedLine();
  const first = suggested ?? auto;
  return (
    <ul className={compact ? "grid grid-cols-3 gap-2" : "space-y-0.5"}>
      {ordered(first).map((l) => (
        <li key={l.id}>
          <a
            href={whatsappHref(text, l.id)}
            target="_blank"
            rel="noopener noreferrer"
            role="menuitem"
            onClick={() => {
              track("whatsapp_click", { location, line: l.country });
              onPick?.();
            }}
            className={
              compact
                ? "flex flex-col items-center gap-1.5 rounded-xl border border-line px-2 py-2.5 text-xs font-semibold text-fg transition-colors hover:border-brand-blue/40 hover:bg-ink-850"
                : "flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-ink-850"
            }
          >
            <Flag code={l.countryCode as "IN" | "US" | "GB"} className={compact ? "h-4 w-6" : undefined} />
            {compact ? (
              l.country
            ) : (
              <>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-fg">{l.country}</span>
                  <span className="block text-xs text-dim">{l.display}</span>
                </span>
                {l.id === first && <span className="rounded-full bg-brand-teal/15 px-2 py-0.5 text-[10.5px] font-semibold text-brand-teal">Suggested</span>}
              </>
            )}
          </a>
        </li>
      ))}
    </ul>
  );
}
