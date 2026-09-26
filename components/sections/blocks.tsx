import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import type { ArchitectureLayer, DivisionId, Point } from "@/data/types";
import { cn } from "@/lib/cn";
import { divisionTone } from "@/components/ui/division";
import { LinkCard, Section, SectionHeader, type SectionTone } from "@/components/ui/primitives";
import { AutoIcon } from "@/components/graphics/autoIcon";
import { TechLogo } from "@/components/graphics/TechLogo";

export function PointsGrid({ points, columns = 3, numbered = false }: { points: Point[]; columns?: 2 | 3 | 4; numbered?: boolean }) {
  return (
    <div className={cn("grid gap-4 sm:grid-cols-2", columns === 3 && "lg:grid-cols-3", columns === 4 && "lg:grid-cols-4")}>
      {points.map((p, i) => (
        <div key={p.title} className="card relative flex gap-4 p-5 sm:flex-col sm:gap-0 sm:p-6">
          <span className="icon-tile">
            <AutoIcon title={p.title} hint={p.description} className="size-5" />
          </span>
          {numbered && <span className="absolute top-6 right-6 hidden text-sm font-semibold text-dim tabular-nums sm:block">{String(i + 1).padStart(2, "0")}</span>}
          <div>
            <h3 className="text-[17px] leading-snug font-semibold text-fg sm:mt-5">{p.title}</h3>
            <p className="mt-1.5 text-[15px] leading-relaxed text-muted sm:mt-2">{p.description}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Compact two-column list with icons, for secondary points that should not dominate the page. */
export function PointsList({ points }: { points: Point[] }) {
  return (
    <ul className="grid gap-x-10 gap-y-7 sm:grid-cols-2">
      {points.map((p) => (
        <li key={p.title} className="flex gap-4">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-blue/10 text-brand-blue">
            <AutoIcon title={p.title} hint={p.description} className="size-[18px]" />
          </span>
          <span>
            <span className="block font-semibold text-fg">{p.title}</span>
            <span className="mt-1 block text-[15px] leading-relaxed text-muted">{p.description}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function ProcessSteps({ steps }: { steps: Point[] }) {
  return (
    <ol className={cn("grid gap-4 sm:grid-cols-2", steps.length >= 5 ? "lg:grid-cols-5" : "lg:grid-cols-4")}>
      {steps.map((s, i) => (
        <li key={s.title} className="card relative overflow-hidden p-5 sm:p-6">
          <span aria-hidden className="absolute right-4 -bottom-5 text-[80px] leading-none font-semibold text-brand-blue/[0.06]">
            {i + 1}
          </span>
          <span className="flex size-8 items-center justify-center rounded-full bg-brand-600 text-sm font-semibold text-white">{i + 1}</span>
          <h3 className="mt-5 text-[16px] font-semibold text-fg">{s.title}</h3>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">{s.description}</p>
        </li>
      ))}
    </ol>
  );
}

export function ArchitectureDiagram({ layers, division = "digital", title }: { layers: ArchitectureLayer[]; division?: DivisionId; title?: string }) {
  const tone = divisionTone[division];
  return (
    <figure className="card overflow-hidden">
      {title && (
        <figcaption className="flex items-center justify-between border-b border-line px-5 py-3.5 text-sm font-semibold text-fg">
          <span>{title}</span>
          <span className={cn("size-1.5 rounded-full", tone.dot)} />
        </figcaption>
      )}
      <div className="space-y-2 p-4 sm:p-5">
        {layers.map((layer, i) => (
          <div key={layer.name} className="relative grid gap-3 rounded-xl border border-line bg-ink-850 p-3 sm:grid-cols-[160px_1fr] sm:items-center sm:p-3.5">
            <div className="flex items-center gap-2.5">
              <span className={cn("flex size-6 items-center justify-center rounded-md text-[10px] font-semibold", tone.bg, tone.text)}>{layers.length - i}</span>
              <span className="text-sm font-medium text-fg">{layer.name}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {layer.items.map((it) => (
                <span key={it} className="rounded-md border border-line bg-ink-900 px-2 py-1 text-xs text-muted">
                  {it}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </figure>
  );
}

export function CheckList({ items, className }: { items: string[]; className?: string }) {
  return (
    <ul className={cn("grid gap-3 sm:grid-cols-2", className)}>
      {items.map((it) => (
        <li key={it} className="flex items-start gap-3 text-[15px] text-muted">
          <Check className="mt-0.5 size-4 shrink-0 text-brand-teal" aria-hidden />
          {it}
        </li>
      ))}
    </ul>
  );
}

export function ChipLinks({ items }: { items: { label: string; href: string }[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((it) => (
        <Link key={it.href} href={it.href} className="chip">
          {it.label}
        </Link>
      ))}
    </div>
  );
}

/** Technology cards with brand logos. */
export function TechGrid({ items, compact }: { items: { slug: string; name: string }[]; compact?: boolean }) {
  return (
    <div className={cn("grid grid-cols-2 gap-3", compact ? "sm:grid-cols-2" : "sm:grid-cols-3 lg:grid-cols-4")}>
      {items.map((t) => (
        <Link key={t.slug} href={`/technologies/${t.slug}`} className="card card-hover flex items-center gap-3 p-4">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-line bg-ink-850 text-fg">
            <TechLogo slug={t.slug} name={t.name} className="size-5" />
          </span>
          <span className="min-w-0 truncate text-sm font-medium text-fg">{t.name}</span>
        </Link>
      ))}
    </div>
  );
}

export interface RelatedItem {
  href: string;
  title: string;
  description?: string;
  eyebrow?: string;
  division?: DivisionId | "product";
}

export function RelatedSection({
  eyebrow,
  title,
  items,
  action,
  columns = 3,
  tone,
}: {
  eyebrow: string;
  title: string;
  items: RelatedItem[];
  action?: { label: string; href: string };
  columns?: 3 | 4;
  tone?: SectionTone;
}) {
  if (!items.length) return null;
  return (
    <Section tone={tone}>
      <SectionHeader eyebrow={eyebrow} title={title} action={action} />
      <div className={cn("grid gap-4 sm:grid-cols-2", columns === 3 ? "lg:grid-cols-3" : "lg:grid-cols-4")}>
        {items.map((it) => (
          <LinkCard key={it.href} {...it} />
        ))}
      </div>
    </Section>
  );
}

export function InlineLinkList({ title, items }: { title: string; items: { label: string; href: string }[] }) {
  if (!items.length) return null;
  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold text-fg">{title}</h3>
      <ul className="space-y-2">
        {items.map((it) => (
          <li key={it.href}>
            <Link href={it.href} className="group inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-fg">
              {it.label}
              <ArrowRight className="size-3 opacity-0 transition-opacity group-hover:opacity-100" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
