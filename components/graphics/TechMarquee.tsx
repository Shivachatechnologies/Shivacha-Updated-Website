import Link from "next/link";
import { technologies } from "@/data/technologies";
import { TechLogo } from "./TechLogo";

const FEATURED = [
  "react", "nextjs", "typescript", "nodejs", "python", "go", "flutter", "kotlin", "swift", "postgresql", "mongodb", "redis",
  "kafka", "kubernetes", "docker", "terraform", "google-cloud", "cloudflare", "ethereum", "solana", "polygon", "solidity", "chainlink", "graphql",
];

/** Continuous logo strip of the technologies we build with. */
export function TechMarquee() {
  const items = FEATURED.map((s) => technologies.find((t) => t.slug === s)).filter((t) => !!t);
  return (
    <div className="relative mx-auto max-w-[calc(var(--container-max)+2*var(--gutter))] overflow-hidden scrollbar-none [mask-image:linear-gradient(90deg,transparent,black_8%,black_92%,transparent)] motion-reduce:overflow-x-auto">
      <ul className="marquee flex w-max gap-3 py-1">
        {[...items, ...items].map((t, i) => (
          <li key={`${t.slug}-${i}`} aria-hidden={i >= items.length || undefined}>
            <Link
              href={`/technologies/${t.slug}`}
              tabIndex={i >= items.length ? -1 : undefined}
              className="flex items-center gap-2.5 rounded-xl border border-line bg-ink-900 px-4 py-3 text-sm font-medium whitespace-nowrap text-fg transition-colors hover:border-line-strong"
            >
              <TechLogo slug={t.slug} name={t.name} className="size-5" />
              {t.name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
