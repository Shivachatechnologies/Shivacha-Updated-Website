import Link from "next/link";
import { insightCategories } from "@/data/insights";
import type { Insight } from "@/data/types";

export function InsightList({ items }: { items: Insight[] }) {
  const sorted = [...items].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <div className="grid gap-x-8 gap-y-12 md:grid-cols-2 lg:grid-cols-3">
      {sorted.map((a) => (
        <Link key={a.slug} href={`/insights/${a.slug}`} className="group flex flex-col border-t border-line pt-6">
          <span className="font-mono text-[11px] text-dim">
            {insightCategories.find((c) => c.slug === a.category)?.name} · {new Date(a.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} · {a.readingTime}
          </span>
          <h2 className="mt-3 text-lg leading-snug font-semibold text-fg group-hover:underline group-hover:decoration-white/30 group-hover:underline-offset-4">{a.title}</h2>
          <p className="mt-2 text-sm text-muted">{a.excerpt}</p>
        </Link>
      ))}
    </div>
  );
}

