/**
 * Content integrity check. Every slug referenced anywhere in /data must resolve,
 * and every slug must be unique, so related-content links can never break.
 * Usage: npm run check:content
 */
import { services } from "../data/services";
import { products } from "../data/products";
import { technologies } from "../data/technologies";
import { serviceGroups } from "../data/serviceGroups";
import { capabilities } from "../data/capabilities";
import { solutions } from "../data/solutions";
import { industries } from "../data/industries";
import { teams } from "../data/teams";
import { caseStudies } from "../data/caseStudies";
import { markets } from "../data/markets";
import { resources } from "../data/resources";
import { insights } from "../data/insights";

const S = new Set(services.map((s) => s.slug));
const P = new Set(products.map((p) => p.slug));
const T = new Set(technologies.map((t) => t.slug));
const I = new Set(industries.map((i) => i.slug));
const SOL = new Set(solutions.map((s) => s.slug));
const TEAM = new Set(teams.map((t) => t.slug));
const G = new Set(serviceGroups.map((g) => g.id));
const M = new Set(markets.map((m) => m.slug));
const issues: string[] = [];

const chk = (set: Set<string>, arr: string[] | undefined, where: string, kind: string) =>
  (arr ?? []).forEach((x) => {
    if (!set.has(x)) issues.push(`${where}: unknown ${kind} "${x}"`);
  });
const unique = (name: string, slugs: string[]) => {
  const seen = new Set<string>();
  for (const s of slugs) {
    if (seen.has(s)) issues.push(`duplicate ${name} slug "${s}"`);
    seen.add(s);
  }
};

unique("service", services.map((s) => s.slug));
unique("product", products.map((p) => p.slug));
unique("technology", technologies.map((t) => t.slug));
unique("industry", industries.map((i) => i.slug));
unique("market", markets.map((m) => m.slug));
unique("resource", resources.map((r) => r.slug));
unique("insight", insights.map((i) => i.slug));

for (const s of services) {
  if (!G.has(s.group)) issues.push(`${s.slug}: unknown group "${s.group}"`);
  chk(T, s.technologies, s.slug, "technology");
  chk(P, s.products, s.slug, "product");
  chk(S, s.related, s.slug, "service");
  chk(I, s.industries, s.slug, "industry");
  if (s.summary.length > 200) issues.push(`${s.slug}: summary longer than 200 chars (used as meta description)`);
}
for (const g of serviceGroups) {
  chk(T, g.technologies, g.id, "technology");
  chk(P, g.products, g.id, "product");
  chk(I, g.industries, g.id, "industry");
  if (g.team && !TEAM.has(g.team)) issues.push(`${g.id}: unknown team "${g.team}"`);
}
for (const p of products) {
  chk(T, p.technologies, p.slug, "technology");
  chk(S, p.services, p.slug, "service");
  chk(P, p.relatedProducts, p.slug, "product");
  chk(I, p.industries, p.slug, "industry");
}
for (const t of technologies) {
  chk(T, t.pairsWith, t.slug, "technology");
  chk(S, t.services, t.slug, "service");
}
for (const c of capabilities) {
  chk(T, c.technologies, c.division, "technology");
  chk(P, c.products, c.division, "product");
  chk(I, c.industries, c.division, "industry");
  c.pillars.forEach((p) => chk(G, p.groups, c.division, "group"));
}
for (const s of solutions) {
  chk(S, s.services, s.slug, "service");
  chk(P, s.products, s.slug, "product");
  chk(T, s.technologies, s.slug, "technology");
  chk(I, s.industries, s.slug, "industry");
}
for (const i of industries) {
  chk(S, i.services, i.slug, "service");
  chk(P, i.products, i.slug, "product");
  chk(T, i.technologies, i.slug, "technology");
  chk(SOL, i.solutionsLinks, i.slug, "solution");
}
for (const t of teams) {
  chk(S, t.services, t.slug, "service");
  chk(T, t.technologies, t.slug, "technology");
}
for (const c of caseStudies) {
  chk(S, c.services, c.slug, "service");
  chk(P, c.products, c.slug, "product");
  chk(T, c.technologies, c.slug, "technology");
  chk(I, c.industries, c.slug, "industry");
  if (c.kind === "client" && !c.client) issues.push(`${c.slug}: client case study without a client name`);
}
for (const m of markets) {
  chk(S, m.services, m.slug, "service");
  chk(I, m.industries, m.slug, "industry");
  chk(M, m.countries, m.slug, "market");
  if (m.region && !M.has(m.region)) issues.push(`${m.slug}: unknown region "${m.region}"`);
}
for (const r of resources) {
  chk(S, r.services, r.slug, "service");
  chk(T, r.technologies, r.slug, "technology");
  chk(I, r.industries, r.slug, "industry");
}
for (const i of insights) {
  chk(S, i.services, i.slug, "service");
  chk(T, i.technologies, i.slug, "technology");
}

if (issues.length) {
  console.error(`${issues.length} content issue(s):\n` + issues.join("\n"));
  process.exit(1);
}
console.log(
  `OK — ${services.length} services, ${products.length} products, ${technologies.length} technologies, ${industries.length} industries, ${solutions.length} solutions, ${teams.length} teams, ${markets.length} markets, ${resources.length} resources, ${insights.length} insights. All references resolve.`,
);
