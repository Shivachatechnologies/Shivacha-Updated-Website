import type { RelatedItem } from "@/components/sections/blocks";
import type { CaseStudy, Insight, Product, Resource, Service, Team, Technology } from "@/data/types";
import { getGroup } from "@/data/serviceGroups";
import { industries } from "@/data/industries";

export const toServiceItem = (s: Service): RelatedItem => {
  const g = getGroup(s.group)!;
  return { href: `/services/${s.slug}`, title: s.name, description: s.summary, eyebrow: g.track ?? g.name, division: g.division };
};
export const toProductItem = (p: Product): RelatedItem => ({ href: `/products/${p.slug}`, title: p.name, description: p.tagline, eyebrow: p.category, division: p.division });
export const toTechItem = (t: Technology) => ({ label: t.name, href: `/technologies/${t.slug}` });
export const toIndustryLink = (slug: string) => {
  const i = industries.find((x) => x.slug === slug);
  return i ? { label: i.name, href: `/industries/${i.slug}` } : null;
};
export const toCaseItem = (c: CaseStudy): RelatedItem => ({ href: `/work/${c.slug}`, title: c.title, description: c.summary, eyebrow: "Reference architecture", division: c.division });
export const toInsightItem = (i: Insight): RelatedItem => ({ href: `/insights/${i.slug}`, title: i.title, description: i.excerpt, eyebrow: `Insight · ${i.readingTime}`, division: i.division });
export const toResourceItem = (r: Resource): RelatedItem => ({ href: `/resources/${r.category}/${r.slug}`, title: r.title, description: r.summary, eyebrow: `${r.type.replace("-", " ")} · ${r.readingTime}`, division: r.division });
export const toTeamItem = (t: Team): RelatedItem => ({ href: `/dedicated-teams/${t.slug}`, title: t.name, description: t.summary, eyebrow: "Dedicated team", division: t.division });

export const nonNull = <T,>(x: (T | null | undefined)[]) => x.filter(Boolean) as T[];
