"use client";

import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface SwitcherPanel {
  id: string;
  label: string;
  color: string;
  content: ReactNode;
}

/**
 * Division selector: an accessible tablist whose panels are rendered on the server (all panels stay in
 * the HTML for SEO; inactive ones are `hidden`). Arrow keys move between tabs.
 */
export function DivisionSwitcher({ panels }: { panels: SwitcherPanel[] }) {
  const [active, setActive] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const next = (active + d + panels.length) % panels.length;
    setActive(next);
    tabs.current[next]?.focus();
  };

  return (
    <div>
      <div role="tablist" aria-label="Shivacha divisions" onKeyDown={onKey} className="-mx-(--gutter) flex gap-1 overflow-x-auto border-b border-line px-(--gutter) [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
        {panels.map((p, i) => (
          <button
            key={p.id}
            ref={(el) => {
              tabs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`div-tab-${p.id}`}
            aria-selected={i === active}
            aria-controls={`div-panel-${p.id}`}
            tabIndex={i === active ? 0 : -1}
            onClick={() => setActive(i)}
            className={cn(
              "relative shrink-0 px-3 pt-2 pb-3.5 font-mono text-[12px] font-medium tracking-[0.08em] whitespace-nowrap uppercase transition-colors duration-200 sm:px-5",
              i === active ? "text-fg" : "text-dim hover:text-muted",
            )}
          >
            <span className="flex items-center gap-2">
              <span className="size-1.5 rounded-full transition-opacity" style={{ background: p.color, opacity: i === active ? 1 : 0.45 }} aria-hidden />
              {p.label}
            </span>
            <span aria-hidden className={cn("absolute inset-x-0 -bottom-px h-[2px] origin-left transition-transform duration-300 ease-out", i === active ? "scale-x-100" : "scale-x-0")} style={{ background: p.color }} />
          </button>
        ))}
      </div>
      {panels.map((p, i) => (
        <div key={p.id} role="tabpanel" id={`div-panel-${p.id}`} aria-labelledby={`div-tab-${p.id}`} hidden={i !== active} className="animate-[fade-in_.35s_ease-out] pt-10 lg:pt-12">
          {p.content}
        </div>
      ))}
    </div>
  );
}
