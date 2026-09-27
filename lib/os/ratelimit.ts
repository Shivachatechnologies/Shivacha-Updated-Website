import "server-only";

/**
 * Small in-memory sliding-window limiter for public endpoints (per server instance). Pair with an edge/WAF rule or
 * Redis for multi-instance guarantees; the database-backed login throttle already covers authentication.
 */
const buckets = new Map<string, number[]>();

export function rateLimited(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  hits.push(now);
  buckets.set(key, hits);
  if (buckets.size > 10_000) buckets.clear();
  return hits.length > max;
}
