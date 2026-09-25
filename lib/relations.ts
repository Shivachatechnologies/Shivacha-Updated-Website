/**
 * Internal linking engine. Every related-content block on the site is derived from structured data here,
 * so adding a service, product or article automatically updates links across the site.
 */
import { services, getService } from "@/data/services";
import { serviceGroups, getGroup } from "@/data/serviceGroups";
import { products, getProduct } from "@/data/products";
import { technologies, getTechnology } from "@/data/technologies";
import { industries, getIndustry } from "@/data/industries";
import { insights } from "@/data/insights";
import { caseStudies } from "@/data/caseStudies";
import { teams, getTeam } from "@/data/teams";
import { solutions } from "@/data/solutions";
import { resources } from "@/data/resources";
import type { DivisionId, Product, Service, ServiceGroup, Technology } from "@/data/types";

const uniq = <T,>(arr: (T | undefined)[]) => [...new Set(arr.filter(Boolean) as T[])];
const take = <T,>(arr: T[], n: number) => arr.slice(0, n);

export const pick = {
  services: (slugs: string[]) => uniq(slugs).map(getService).filter(Boolean) as Service[],
  products: (slugs: string[]) => uniq(slugs).map(getProduct).filter(Boolean) as Product[],
  technologies: (slugs: string[]) => uniq(slugs).map(getTechnology).filter(Boolean) as Technology[],
  industries: (slugs: string[]) => uniq(slugs).map(getIndustry).filter(Boolean) as NonNullable<ReturnType<typeof getIndustry>>[],
};

export const serviceDivision = (s: Service): DivisionId => getGroup(s.group)!.division;
export const serviceHref = (slug: string) => `/services/${slug}`;

/** Services in the same group first, then explicit relations, then same division. */
export function relatedServices(s: Service, n = 6): Service[] {
  const group = getGroup(s.group)!;
  const explicit = pick.services(s.related ?? []);
  const siblings = services.filter((x) => x.group === s.group && x.slug !== s.slug);
  const division = services.filter((x) => x.slug !== s.slug && getGroup(x.group)?.division === group.division && x.group !== s.group);
  return take(uniq([...explicit, ...siblings, ...division]).filter((x) => x.slug !== s.slug), n);
}

export function serviceProducts(s: Service, n = 6): Product[] {
  const g = getGroup(s.group)!;
  const fromTech = products.filter((p) => p.services.includes(s.slug));
  return take(uniq([...pick.products(s.products ?? []), ...fromTech, ...pick.products(g.products)]), n);
}

export function serviceTechnologies(s: Service, n = 6): Technology[] {
  const g = getGroup(s.group)!;
  return take(uniq([...pick.technologies(s.technologies ?? []), ...pick.technologies(g.technologies)]), n);
}

export function serviceIndustries(s: Service, n = 6) {
  const g = getGroup(s.group)!;
  return take(uniq([...pick.industries(s.industries ?? []), ...pick.industries(g.industries)]), n);
}

export function relatedInsights(opts: { division?: DivisionId; services?: string[]; technologies?: string[] }, n = 3) {
  const score = (i: (typeof insights)[number]) =>
    (opts.division && i.division === opts.division ? 2 : 0) +
    i.services.filter((x) => opts.services?.includes(x)).length * 3 +
    i.technologies.filter((x) => opts.technologies?.includes(x)).length;
  return take(
    insights
      .map((i) => ({ i, s: score(i) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .map((x) => x.i),
    n,
  );
}

export function relatedCaseStudies(opts: { division?: DivisionId; services?: string[]; products?: string[]; industry?: string }, n = 2) {
  const score = (c: (typeof caseStudies)[number]) =>
    (opts.division && c.division === opts.division ? 1 : 0) +
    c.services.filter((x) => opts.services?.includes(x)).length * 3 +
    c.products.filter((x) => opts.products?.includes(x)).length * 2 +
    (opts.industry && c.industries.includes(opts.industry) ? 2 : 0);
  return take(
    caseStudies
      .map((c) => ({ c, s: score(c) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .map((x) => x.c),
    n,
  );
}

export function relatedResources(opts: { division?: DivisionId; services?: string[] }, n = 3) {
  const score = (r: (typeof resources)[number]) =>
    (opts.division && r.division === opts.division ? 1 : 0) + r.services.filter((x) => opts.services?.includes(x)).length * 3;
  return take(
    resources
      .map((r) => ({ r, s: score(r) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .map((x) => x.r),
    n,
  );
}

export const groupTeam = (g: ServiceGroup) => (g.team ? getTeam(g.team) : undefined);

// ───── Reverse lookups ─────

/** Services that use a technology directly or through their group. */
export function servicesForTechnology(t: Technology, n = 12): Service[] {
  const direct = services.filter((s) => s.technologies?.includes(t.slug));
  const viaGroup = services.filter((s) => getGroup(s.group)?.technologies.includes(t.slug));
  return take(uniq([...pick.services(t.services), ...direct, ...viaGroup]), n);
}
export const productsForTechnology = (t: Technology, n = 6) => take(products.filter((p) => p.technologies.includes(t.slug)), n);
export const teamsForTechnology = (t: Technology, n = 4) => take(teams.filter((x) => x.technologies.includes(t.slug)), n);

export const productsForIndustry = (slug: string) => products.filter((p) => p.industries.includes(slug));
export const solutionsForIndustry = (slug: string) => solutions.filter((s) => s.industries.includes(slug));
export const groupsForDivision = (d: DivisionId) => serviceGroups.filter((g) => g.division === d);
export const servicesForGroup = (id: string) => services.filter((s) => s.group === id);
export const servicesForDivision = (d: DivisionId) => services.filter((s) => getGroup(s.group)?.division === d);
export const productsForDivision = (d: DivisionId) => products.filter((p) => p.division === d);

export const technologiesUsedByProduct = (p: Product) => pick.technologies(p.technologies);
export const allTechnologies = technologies;
export const allIndustries = industries;
