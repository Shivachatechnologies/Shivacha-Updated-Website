import { Plus } from "lucide-react";
import type { FAQ as FAQItem } from "@/data/types";
import { faqSchema } from "@/lib/jsonld";
import { JsonLd, Section, SectionHeader } from "@/components/ui/primitives";

export function FAQ({ items, title = "Frequently asked questions", eyebrow = "FAQ" }: { items: FAQItem[]; title?: string; eyebrow?: string }) {
  if (!items.length) return null;
  return (
    <Section id="faq">
      <JsonLd data={faqSchema(items)} />
      <div className="grid gap-12 lg:grid-cols-[1fr_1.6fr]">
        <SectionHeader eyebrow={eyebrow} title={title} className="mb-0" />
        <div className="divide-y divide-line border-y border-line">
          {items.map((f) => (
            <details key={f.q} className="group py-5">
              <summary className="flex cursor-pointer list-none items-start justify-between gap-6 text-left text-base font-medium text-fg [&::-webkit-details-marker]:hidden">
                {f.q}
                <Plus className="mt-1 size-4 shrink-0 text-dim transition-transform group-open:rotate-45" aria-hidden />
              </summary>
              <p className="mt-3 pr-10 text-[15px] leading-relaxed text-muted">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </Section>
  );
}
