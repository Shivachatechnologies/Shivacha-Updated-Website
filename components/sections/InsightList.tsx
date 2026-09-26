import Link from "next/link";
import { insightCategories } from "@/data/insights";
import type { Insight } from "@/data/types";
import { Cover } from "@/components/graphics/Cover";

export function InsightList({ items }: { items: Insight[] }) {
  const sorted = [...items].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
      {sorted.map((a) => {
        const cat = insightCategories.find((c) => c.slug === a.category)?.name;
        return (
          <Link key={a.slug} href={`/insights/${a.slug}`} className="card card-hover group flex flex-col overflow-hidden p-3">
            <Cover kind={a.category} label={cat} />
            <div className="flex flex-1 flex-col p-3 pt-5">
              <span className="text-xs font-medium text-dim">
                {new Date(a.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} · {a.readingTime}
              </span>
              <h2 className="mt-2 text-lg leading-snug font-semibold text-fg group-hover:text-brand-blue">{a.title}</h2>
              <p className="mt-2 line-clamp-2 text-sm text-muted">{a.excerpt}</p>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
