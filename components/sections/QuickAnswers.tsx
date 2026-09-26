import { Sparkles } from "lucide-react";
import { Section } from "@/components/ui/primitives";

/**
 * Short, direct answers to the questions people (and AI assistants) ask about a service.
 * Rendered as plain, crawlable text in a definition list.
 */
export function QuickAnswers({ title, items }: { title: string; items: { q: string; a: string | string[] }[] }) {
  return (
    <Section id="quick-answers">
      <div className="grid gap-10 lg:grid-cols-[1fr_2fr]">
        <div>
          <p className="eyebrow mb-4 flex items-center gap-2">
            <Sparkles className="size-3.5" aria-hidden /> Quick answers
          </p>
          <h2 className="h-section text-fg">{title}</h2>
          <p className="mt-4 text-[15px] text-muted">The essentials in brief. Every project is scoped individually — ask us for specifics.</p>
        </div>
        <dl className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2">
          {items.map((it) => (
            <div key={it.q} className="bg-ink-900 p-5 sm:p-6">
              <dt className="text-sm font-semibold text-fg">{it.q}</dt>
              <dd className="mt-2 text-[14.5px] leading-relaxed text-muted">
                {Array.isArray(it.a) ? (
                  <ul className="list-disc space-y-1 pl-4 marker:text-brand-blue">
                    {it.a.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                ) : (
                  it.a
                )}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </Section>
  );
}
