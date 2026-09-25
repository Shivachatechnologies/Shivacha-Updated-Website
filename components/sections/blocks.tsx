import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import type { ArchitectureLayer, DivisionId, Point } from "@/data/types";
import { cn } from "@/lib/cn";
import { divisionTone } from "@/components/ui/division";
import { LinkCard, Section, SectionHeader } from "@/components/ui/primitives";

export function PointsGrid({ points, columns = 3, numbered = false }: { points: Point[]; columns?: 2 | 3 | 4; numbered?: boolean }) {
  return (
    <div className={cn("grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2", columns === 3 && "lg:grid-cols-3", columns === 4 && "lg:grid-cols-4")}>
      {points.map((p, i) => (
        <div key={p.title} className="bg-ink-950 p-6 sm:p-7">
          {numbered && <span className="mb-4 block font-mono text-xs text-dim">{String(i + 1).padStart(2, "0")}</span>}
          <h3 className="h-card text-fg">{p.title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted">{p.description}</p>
        </div>
      ))}
    </div>
  );
}

export function ProcessSteps({ steps }: { steps: Point[] }) {
  return (
    <ol className="relative grid gap-6 md:grid-cols-5 md:gap-4">
      {steps.map((s, i) => (
        <li key={s.title} className="relative">
          <div className="mb-4 flex items-center gap-3">
            <span className="flex size-8 items-center justify-center rounded-full border border-line-strong bg-ink-900 font-mono text-xs text-fg">{i + 1}</span>
            {i < steps.length - 1 && <span className="hidden h-px flex-1 bg-gradient-to-r from-white/20 to-transparent md:block" aria-hidden />}
          </div>
          <h3 className="text-[15px] font-semibold text-fg">{s.title}</h3>
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
        <figcaption className="flex items-center justify-between border-b border-line px-5 py-3 font-mono text-[11px] tracking-wider text-dim uppercase">
          <span>{title}</span>
          <span className={cn("size-1.5 rounded-full", tone.dot)} />
        </figcaption>
      )}
      <div className="space-y-2 p-4 sm:p-5">
        {layers.map((layer, i) => (
          <div key={layer.name} className="relative grid gap-3 rounded-xl border border-line bg-ink-900/70 p-3 sm:grid-cols-[150px_1fr] sm:items-center sm:p-4">
            <div className="flex items-center gap-2">
              <span className={cn("font-mono text-[10px]", tone.text)}>L{layers.length - i}</span>
              <span className="text-sm font-medium text-fg">{layer.name}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {layer.items.map((it) => (
                <span key={it} className="rounded-md border border-line bg-white/[0.03] px-2 py-1 text-xs text-muted">
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
}: {
  eyebrow: string;
  title: string;
  items: RelatedItem[];
  action?: { label: string; href: string };
  columns?: 3 | 4;
}) {
  if (!items.length) return null;
  return (
    <Section>
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
      <h3 className="mb-3 font-mono text-[11px] tracking-[0.16em] text-dim uppercase">{title}</h3>
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
