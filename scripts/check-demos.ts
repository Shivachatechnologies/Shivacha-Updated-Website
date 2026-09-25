/**
 * Verifies every configured product demo URL before publishing.
 * Usage: npm run check:demos
 * Products without a demoUrl automatically show "Request Demo", so only configured URLs are checked.
 */
import { demoLinks } from "../data/demoLinks";
import { products } from "../data/products";

async function main() {
  const entries = Object.entries(demoLinks).filter(([, v]) => v.demoUrl);
  const slugs = new Set(products.map((p) => p.slug));
  const problems: string[] = [];
  for (const [slug, v] of entries) {
    if (!slugs.has(slug)) problems.push(`${slug}: no product with this slug`);
    if (!/^https:\/\//.test(v.demoUrl!)) problems.push(`${slug}: demo URL must use https (${v.demoUrl})`);
    try {
      const res = await fetch(v.demoUrl!, { method: "GET", redirect: "follow", signal: AbortSignal.timeout(10000) });
      if (res.status >= 400) problems.push(`${slug}: ${v.demoUrl} responded ${res.status}`);
    } catch (e) {
      problems.push(`${slug}: ${v.demoUrl} unreachable (${(e as Error).message})`);
    }
  }
  console.log(`${entries.length} demo URL(s) configured; ${products.length - entries.length} product(s) fall back to Request Demo.`);
  if (problems.length) {
    console.error(problems.join("\n"));
    process.exit(1);
  }
  console.log("All demo links OK.");
}
main();
