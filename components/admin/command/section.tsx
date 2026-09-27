import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Command-center panel: mono eyebrow, title, optional actions. `dark` renders on the deep navy operations surface. */
export function OpsPanel({ eyebrow, title, actions, children, dark, className, bodyClassName }: { eyebrow?: string; title: string; actions?: ReactNode; children: ReactNode; dark?: boolean; className?: string; bodyClassName?: string }) {
  return (
    <section data-theme={dark ? "dark" : undefined} className={cn("min-w-0 overflow-hidden rounded-xl border", dark ? "os-surface border-white/[0.07] text-fg shadow-[0_24px_60px_-36px_rgb(3_7_15/0.9)]" : "border-line bg-ink-900 shadow-[0_1px_2px_rgb(11_20_36/0.04)]", className)}>
      <header className={cn("flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b px-4 py-3 sm:px-5", dark ? "border-white/[0.06]" : "border-line")}>
        <div className="min-w-0">
          {eyebrow && <p className={cn("font-mono text-[10px] tracking-[0.16em] uppercase", dark ? "text-[#6f86a6]" : "text-dim")}>{eyebrow}</p>}
          <h2 className={cn("truncate text-[15px] font-semibold tracking-[-0.01em]", dark ? "text-white" : "text-fg")}>{title}</h2>
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </header>
      <div className={cn("p-4 sm:p-5", bodyClassName)}>{children}</div>
    </section>
  );
}
