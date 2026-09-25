/**
 * Central registry of product demo assets.
 *
 * - Add a `demoUrl` (https only) to show a "Live Demo" button on the product page.
 * - Products without a demoUrl automatically fall back to "Request Demo".
 * - `npm run check:demos` verifies every URL responds before you publish.
 * - Screenshots should be placed in /public/products/<slug>/ and referenced by path.
 *
 * Leave entries empty until a demo environment is live and verified. Never add placeholder URLs.
 */
export interface DemoLink {
  demoUrl?: string;
  videoUrl?: string;
  heroImage?: string;
  screenshots?: string[];
}

export const demoLinks: Record<string, DemoLink> = {
  // "crypto-exchange": { demoUrl: "https://demo.example.com" },
};
