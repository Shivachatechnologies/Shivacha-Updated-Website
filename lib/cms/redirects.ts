import "server-only";
import { db } from "@/lib/db/client";

type Rule = { destination: string; statusCode: number; id: string };
let cache: { at: number; map: Map<string, Rule> } | null = null;
const TTL = 60_000;

/** Active CMS redirects keyed by normalised source path, refreshed at most once a minute per server instance. */
export async function findRedirect(pathname: string): Promise<Rule | null> {
  if (!process.env.DATABASE_URL) return null;
  if (!cache || Date.now() - cache.at > TTL) {
    try {
      const rows = await db.redirect.findMany({ where: { active: true }, select: { id: true, source: true, destination: true, statusCode: true } });
      cache = { at: Date.now(), map: new Map(rows.map((r) => [normalise(r.source), { destination: r.destination, statusCode: r.statusCode, id: r.id }])) };
    } catch {
      cache = { at: Date.now(), map: new Map() }; // database unavailable: never block the public site
    }
  }
  return cache.map.get(normalise(pathname)) ?? null;
}

export const invalidateRedirectCache = () => {
  cache = null;
};

export const normalise = (p: string) => (p.length > 1 ? p.replace(/\/+$/, "") : p).toLowerCase();

/** Best-effort hit counter; never delays or fails the redirect. */
export function recordRedirectHit(id: string) {
  db.redirect.update({ where: { id }, data: { hits: { increment: 1 } } }).catch(() => {});
}
