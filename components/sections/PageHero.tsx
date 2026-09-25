import type { ReactNode } from "react";
import { Breadcrumbs, type Crumb } from "@/components/ui/Breadcrumbs";
import { cn } from "@/lib/cn";

export function PageHero({
  crumbs,
  eyebrow,
  title,
  lede,
  children,
  aside,
  accent = "#4c82ff",
}: {
  crumbs: Crumb[];
  eyebrow?: ReactNode;
  title: ReactNode;
  lede?: ReactNode;
  children?: ReactNode;
  aside?: ReactNode;
  accent?: string;
}) {
  return (
    <header className="relative overflow-hidden pt-28 pb-16 sm:pt-32 sm:pb-20 lg:pt-36">
      <div className="grid-bg grid-fade pointer-events-none absolute inset-0" aria-hidden />
      <div
        className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[900px] -translate-x-1/2 rounded-full opacity-[0.16] blur-[120px]"
        style={{ background: `radial-gradient(closest-side, ${accent}, transparent)` }}
        aria-hidden
      />
      <div className="container-x relative">
        <Breadcrumbs items={crumbs} />
        <div className={cn("grid gap-12", !!aside && "lg:grid-cols-[1.25fr_1fr] lg:items-center")}>
          <div>
            {eyebrow && <div className="mb-5">{eyebrow}</div>}
            <h1 className="h-page text-gradient">{title}</h1>
            {lede && <p className="lede mt-6 max-w-3xl">{lede}</p>}
            {children && <div className="mt-9 flex flex-wrap gap-3">{children}</div>}
          </div>
          {aside && <div className="relative">{aside}</div>}
        </div>
      </div>
    </header>
  );
}
