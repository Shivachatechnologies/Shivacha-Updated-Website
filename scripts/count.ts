import { services } from "../data/services";
import { serviceGroups } from "../data/serviceGroups";
const seen = new Map<string, number>();
for (const s of services) seen.set(s.slug, (seen.get(s.slug) || 0) + 1);
console.log("services", services.length, "unique", seen.size);
console.log("dupes", [...seen].filter(([, n]) => n > 1));
const gids = new Set(serviceGroups.map((g) => g.id));
console.log("bad groups", services.filter((s) => !gids.has(s.group)).map((s) => s.slug));
for (const g of serviceGroups) console.log(g.id, services.filter((s) => s.group === g.id).length);
