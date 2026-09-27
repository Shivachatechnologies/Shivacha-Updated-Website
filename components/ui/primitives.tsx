import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { DivisionId } from "@/data/types";
import { divisionLabel, divisionTone } from "./division";
import { AutoIcon } from "@/components/graphics/autoIcon";

export type SectionTone = "plain" | "muted" | "brand";

/** Page section. `tone` alternates the background band so long pages read as distinct blocks. */
export function Section({
  children,
  className,
  id,
  tone,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
  /** Omit to let bands alternate automatically down the page. */
  tone?: SectionTone;
}) {
  return (
    <section
      id={id}
      data-tone={tone}
      data-theme={tone === "brand" ? "dark" : undefined}
      className={cn("relative py-12 sm:py-16 lg:py-24", tone === "muted" && "band-muted", tone === "brand" && "band-brand text-fg", className)}
    >
      <div className="container-x relative">{children}</div>
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
    <div className={cn("reveal mb-10 flex flex-col gap-5 lg:mb-12", align === "center" ? "items-center text-center" : "md:flex-row md:items-end md:justify-between", className)}>
      <div className={cn("max-w-2xl", align === "center" && "mx-auto")}>
        {eyebrow && <p className={cn("eyebrow mb-4", align === "center" && "justify-center")}>{eyebrow}</p>}
        <h2 className="h-section text-fg">{title}</h2>
        {lede && <p className="lede mt-4">{lede}</p>}
      </div>
      {action && (
        <Link href={action.href} className="group inline-flex shrink-0 items-center gap-2 border-b border-line-strong pb-1 text-sm font-medium text-fg transition-colors hover:border-fg">
          {action.label} <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
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
      <div className="mb-5 flex items-start justify-between gap-3">
        <span className={cn("flex size-10 items-center justify-center rounded-lg", division ? cn(divisionTone[division].bg, divisionTone[division].text) : "bg-brand-blue/10 text-brand-blue")}>
          <AutoIcon title={title} hint={`${eyebrow ?? ""} ${description ?? ""}`} className="size-5" />
        </span>
        {eyebrow && <span className="rounded-full border border-line px-2.5 py-1 text-[11px] font-medium text-muted">{eyebrow}</span>}
      </div>
      <h3 className="h-card text-fg">{title}</h3>
      {description && <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted">{description}</p>}
      {children}
      <span className="mt-auto flex items-center gap-1.5 pt-5 text-sm font-medium text-brand-blue">
        Learn more <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}

export function JsonLd({ data }: { data: object | object[] }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}
