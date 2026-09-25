import { services } from "../data/services";
import { products } from "../data/products";
import { technologies } from "../data/technologies";
import { serviceGroups } from "../data/serviceGroups";
import { capabilities } from "../data/capabilities";
const S = new Set(services.map((s) => s.slug));
const P = new Set(products.map((p) => p.slug));
const T = new Set(technologies.map((t) => t.slug));
const issues: string[] = [];
const chk = (set: Set<string>, arr: string[] | undefined, where: string, kind: string) =>
  (arr || []).forEach((x) => { if (!set.has(x)) issues.push(`${where}: unknown ${kind} ${x}`); });
console.log("techs", technologies.length, "unique", T.size);
for (const s of services) { chk(T, s.technologies, s.slug, "tech"); chk(P, s.products, s.slug, "product"); chk(S, s.related, s.slug, "service"); }
for (const p of products) { chk(T, p.technologies, p.slug, "tech"); chk(S, p.services, p.slug, "service"); chk(P, p.relatedProducts, p.slug, "product"); }
for (const t of technologies) { chk(T, t.pairsWith, t.slug, "tech"); chk(S, t.services, t.slug, "service"); }
for (const g of serviceGroups) { chk(T, g.technologies, g.id, "tech"); chk(P, g.products, g.id, "product"); }
for (const c of capabilities) { chk(T, c.technologies, c.division, "tech"); chk(P, c.products, c.division, "product"); }
console.log(issues.join("\n") || "OK");
