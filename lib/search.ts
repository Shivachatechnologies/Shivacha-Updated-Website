import { services } from "@/data/services";
import { getGroup } from "@/data/serviceGroups";
import { products } from "@/data/products";
import { capabilities, divisions } from "@/data/capabilities";
import { technologies } from "@/data/technologies";
import { industries } from "@/data/industries";
import { solutions } from "@/data/solutions";
import { caseStudies } from "@/data/caseStudies";
import { insights } from "@/data/insights";
import { resources } from "@/data/resources";
import { teams } from "@/data/teams";
import { markets } from "@/data/markets";

export interface SearchEntry {
  /** title */
  t: string;
  /** href */
  h: string;
  /** kind */
  k: string;
  /** description */
  d: string;
  /** extra keywords */
  x?: string;
}

export function buildSearchIndex(): SearchEntry[] {
  return [
    ...capabilities.map((c) => {
      const d = divisions.find((x) => x.id === c.division)!;
      return { t: d.name, h: `/capabilities/${c.division}`, k: "Capability", d: d.tagline, x: d.short };
    }),
    ...products.map((p) => ({ t: p.name, h: `/products/${p.slug}`, k: "Product", d: p.tagline, x: `${p.category} ${p.slug.replace(/-/g, " ")}` })),
    ...services.map((s) => ({ t: s.name, h: `/services/${s.slug}`, k: "Service", d: s.summary, x: getGroup(s.group)?.name })),
    ...solutions.map((s) => ({ t: s.name, h: `/solutions/${s.slug}`, k: "Solution", d: s.summary })),
    ...industries.map((i) => ({ t: i.name, h: `/industries/${i.slug}`, k: "Industry", d: i.summary })),
    ...technologies.map((t) => ({ t: t.name, h: `/technologies/${t.slug}`, k: "Technology", d: t.summary, x: t.category })),
    ...teams.map((t) => ({ t: t.name, h: `/dedicated-teams/${t.slug}`, k: "Team", d: t.summary })),
    ...caseStudies.map((c) => ({ t: c.title, h: `/work/${c.slug}`, k: "Case study", d: c.summary })),
    ...insights.map((i) => ({ t: i.title, h: `/insights/${i.slug}`, k: "Insight", d: i.excerpt, x: i.tags.join(" ") })),
    ...resources.map((r) => ({ t: r.title, h: `/resources/${r.category}/${r.slug}`, k: "Resource", d: r.summary })),
    ...markets.map((m) => ({ t: m.name, h: `/markets/${m.slug}`, k: "Market", d: m.summary })),
  ];
}
