/**
 * Route & SEO smoke test against a running server.
 * Usage: BASE_URL=http://localhost:3000 npx tsx scripts/test-routes.ts
 * Checks: HTTP 200, exactly one <h1>, unique <title> and meta description, canonical, breadcrumb JSON-LD, internal links resolve.
 */
import { allRoutes, nonIndexedRoutes } from "../lib/routes";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const routes = [...allRoutes().map((r) => r.path), ...nonIndexedRoutes()];
const titles = new Map<string, string[]>();
const descs = new Map<string, string[]>();
const failures: string[] = [];
const internalLinks = new Set<string>();
const known = new Set(routes);

const get = (html: string, re: RegExp) => html.match(re)?.[1]?.trim() ?? "";

async function check(path: string) {
  const res = await fetch(BASE + path, { redirect: "manual" });
  if (res.status !== 200) return failures.push(`${path}: HTTP ${res.status}`);
  const html = await res.text();
  const h1s = (html.match(/<h1[\s>]/g) ?? []).length;
  if (h1s !== 1) failures.push(`${path}: ${h1s} <h1> elements`);
  const title = get(html, /<title>([^<]*)<\/title>/);
  const desc = get(html, /<meta name="description" content="([^"]*)"/);
  if (!title) failures.push(`${path}: missing title`);
  if (!desc) failures.push(`${path}: missing description`);
  if (!/<link rel="canonical"/.test(html)) failures.push(`${path}: missing canonical`);
  if (path !== "/" && !html.includes('"BreadcrumbList"')) failures.push(`${path}: missing breadcrumb schema`);
  titles.set(title, [...(titles.get(title) ?? []), path]);
  descs.set(desc, [...(descs.get(desc) ?? []), path]);
  for (const m of html.matchAll(/href="(\/[^"#?]*)(?:[?#][^"]*)?"/g)) internalLinks.add(m[1]);
}

async function main() {
  const queue = [...routes];
  const workers = Array.from({ length: 8 }, async () => {
    while (queue.length) await check(queue.shift()!);
  });
  await Promise.all(workers);

  for (const [t, ps] of titles) if (ps.length > 1) failures.push(`Duplicate title "${t}": ${ps.join(", ")}`);
  for (const [d, ps] of descs) if (ps.length > 1) failures.push(`Duplicate description on: ${ps.join(", ")} ("${d.slice(0, 60)}…")`);

  const skip = (l: string) => l.startsWith("/_next") || l.startsWith("/api") || /\.(svg|png|json|xml|txt|ico)$/.test(l) || l === "/opengraph-image";
  const unknown = [...internalLinks].filter((l) => !skip(l) && !known.has(l.replace(/\/$/, "") || "/"));
  for (const l of unknown) {
    const res = await fetch(BASE + l, { redirect: "manual" });
    if (res.status >= 400) failures.push(`Broken internal link: ${l} (${res.status})`);
  }

  console.log(`Checked ${routes.length} routes, ${internalLinks.size} unique internal links.`);
  if (failures.length) {
    console.log(`\n${failures.length} issue(s):\n` + failures.join("\n"));
    process.exit(1);
  }
  console.log("All routes passed.");
}
main();
