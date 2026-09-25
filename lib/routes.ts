/** Single source of truth for every indexable route — used by the sitemap and the route test script. */
import { capabilities } from "@/data/capabilities";
import { services } from "@/data/services";
import { products } from "@/data/products";
import { solutions } from "@/data/solutions";
import { industries } from "@/data/industries";
import { technologies } from "@/data/technologies";
import { teams } from "@/data/teams";
import { caseStudies } from "@/data/caseStudies";
import { markets } from "@/data/markets";
import { resources, resourceCategories } from "@/data/resources";
import { insights, insightCategories } from "@/data/insights";
import { companyPages } from "@/data/company";
import { careerDepartments, jobs } from "@/data/careers";
import { legalPages } from "@/data/legal";
import { divisions } from "@/data/capabilities";

export interface RouteEntry {
  path: string;
  priority: number;
  lastModified?: string;
  section: string;
}

export function allRoutes(): RouteEntry[] {
  const r = (path: string, priority: number, section: string, lastModified?: string): RouteEntry => ({ path, priority, section, lastModified });
  const indexableResourceCats = resourceCategories.filter((c) => resources.some((x) => x.category === c.slug) || ["faqs", "case-studies"].includes(c.slug));
  return [
    r("/", 1, "home"),
    ...["/capabilities", "/services", "/products", "/solutions", "/industries", "/technologies", "/dedicated-teams", "/work", "/markets", "/resources", "/insights", "/company", "/careers", "/contact"].map((p) => r(p, 0.9, "index")),
    ...["/start-a-project", "/request-demo", "/book-a-meeting", "/hire-developers"].map((p) => r(p, 0.7, "contact")),
    ...capabilities.map((c) => r(`/capabilities/${c.division}`, 0.9, "capabilities")),
    ...services.map((s) => r(`/services/${s.slug}`, 0.8, "services")),
    ...products.map((p) => r(`/products/${p.slug}`, 0.8, "products")),
    ...solutions.map((s) => r(`/solutions/${s.slug}`, 0.8, "solutions")),
    ...industries.map((i) => r(`/industries/${i.slug}`, 0.7, "industries")),
    ...technologies.map((t) => r(`/technologies/${t.slug}`, 0.6, "technologies")),
    ...teams.map((t) => r(`/dedicated-teams/${t.slug}`, 0.7, "teams")),
    ...["case-studies", ...divisions.map((d) => d.id)].map((c) => r(`/work/${c}`, 0.5, "work")),
    ...caseStudies.map((c) => r(`/work/${c.slug}`, 0.6, "work")),
    ...markets.map((m) => r(`/markets/${m.slug}`, 0.6, "markets")),
    ...indexableResourceCats.map((c) => r(`/resources/${c.slug}`, 0.5, "resources")),
    ...resources.map((x) => r(`/resources/${x.category}/${x.slug}`, 0.6, "resources", x.date)),
    ...insightCategories.map((c) => r(`/insights/${c.slug}`, 0.5, "insights")),
    ...insights.map((i) => r(`/insights/${i.slug}`, 0.6, "insights", i.date)),
    ...companyPages.map((p) => r(`/company/${p.slug}`, 0.5, "company")),
    r("/company/leadership", 0.5, "company"),
    r("/company/founder", 0.5, "company"),
    ...careerDepartments.map((d) => r(`/careers/${d.slug}`, 0.4, "careers")),
    ...jobs.map((j) => r(`/careers/${j.slug}`, 0.4, "careers")),
    ...legalPages.map((p) => r(`/${p.slug}`, 0.2, "legal")),
  ];
}

/** Routes that exist but are intentionally excluded from the sitemap (noindex). */
export const nonIndexedRoutes = () => resourceCategories.filter((c) => !resources.some((x) => x.category === c.slug) && !["faqs", "case-studies"].includes(c.slug)).map((c) => `/resources/${c.slug}`);
