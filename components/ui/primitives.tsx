import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { DivisionId } from "@/data/types";
import { divisionLabel, divisionTone } from "./division";

export function Section({ children, className, id, bordered = true }: { children: ReactNode; className?: string; id?: string; bordered?: boolean }) {
  return (
    <section id={id} className={cn("relative py-20 sm:py-24 lg:py-28", bordered && "border-t border-line", className)}>
      <div className="container-x">{children}</div>
    </section>
  );
}

export function SectionHeader({
  eyebrow,
  title,
  lede,
  action,
  align = "left",
  className,
}: {
  eyebrow?: string;
  title: ReactNode;
  lede?: ReactNode;
  action?: { label: string; href: string };
  align?: "left" | "center";
  className?: string;
}) {
  return (
    <div className={cn("mb-12 flex flex-col gap-6 lg:mb-14", align === "center" ? "items-center text-center" : "md:flex-row md:items-end md:justify-between", className)}>
      <div className={cn("max-w-3xl", align === "center" && "mx-auto")}>
        {eyebrow && <p className="eyebrow mb-4">{eyebrow}</p>}
        <h2 className="h-section text-gradient">{title}</h2>
        {lede && <p className="lede mt-5">{lede}</p>}
      </div>
      {action && (
        <Link href={action.href} className="btn-secondary shrink-0">
          {action.label} <ArrowRight className="size-4" />
        </Link>
      )}
    </div>
  );
}

export function LinkButton({
  href,
  children,
  variant = "primary",
  className,
  track,
  external,
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost";
  className?: string;
  track?: string;
  external?: boolean;
}) {
  const cls = cn(variant === "primary" ? "btn-primary" : variant === "secondary" ? "btn-secondary" : "btn-ghost", className);
  if (external)
    return (
      <a href={href} className={cls} data-track={track} target="_blank" rel="noopener noreferrer">
        {children}
        <ArrowUpRight className="size-4" />
      </a>
    );
  return (
    <Link href={href} className={cls} data-track={track}>
      {children}
      <ArrowRight className="size-4" />
    </Link>
  );
}

export function DivisionBadge({ division, className }: { division: DivisionId | "product"; className?: string }) {
  const t = divisionTone[division];
  return (
    <span className={cn("inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-medium", t.border, t.bg, t.text, className)}>
      <span className={cn("size-1.5 rounded-full", t.dot)} />
      {divisionLabel[division]}
    </span>
  );
}

export function Pill({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("inline-flex items-center rounded-full border border-line px-2.5 py-0.5 text-[11px] text-muted", className)}>{children}</span>;
}

export function LinkCard({
  href,
  title,
  description,
  eyebrow,
  division,
  className,
  children,
}: {
  href: string;
  title: string;
  description?: string;
  eyebrow?: string;
  division?: DivisionId | "product";
  className?: string;
  children?: ReactNode;
}) {
  return (
    <Link href={href} className={cn("card card-hover group flex h-full flex-col p-6", className)}>
      <div className="mb-3 flex items-center justify-between gap-3">
        {eyebrow ? <span className="font-mono text-[10.5px] tracking-[0.16em] text-dim uppercase">{eyebrow}</span> : <span />}
        {division && <span className={cn("size-1.5 rounded-full", divisionTone[division].dot)} aria-hidden />}
      </div>
      <h3 className="h-card text-fg">{title}</h3>
      {description && <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted">{description}</p>}
      {children}
      <span className="mt-auto flex items-center gap-1.5 pt-5 text-sm text-muted transition-colors group-hover:text-fg">
        Learn more <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}

export function JsonLd({ data }: { data: object | object[] }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}
