/** Dashboard date ranges: Today, 7 / 30 / 90 days, This year, All time or Custom (from/to, UTC). */
export const RANGES = [
  ["today", "Today"],
  ["7d", "7 days"],
  ["30d", "30 days"],
  ["90d", "90 days"],
  ["ytd", "This year"],
  ["all", "All time"],
  ["custom", "Custom"],
] as const;
export type RangeKey = (typeof RANGES)[number][0];

export function resolveRange(key: string | undefined, fromS?: string, toS?: string, now = new Date()): { key: RangeKey; from?: Date; to?: Date; label: string } {
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const k = (RANGES.find((r) => r[0] === key)?.[0] ?? "30d") as RangeKey;
  const ago = (n: number) => new Date(day.getTime() - (n - 1) * 86400_000);
  switch (k) {
    case "today":
      return { key: k, from: day, to: now, label: "Today" };
    case "7d":
      return { key: k, from: ago(7), to: now, label: "Last 7 days" };
    case "30d":
      return { key: k, from: ago(30), to: now, label: "Last 30 days" };
    case "90d":
      return { key: k, from: ago(90), to: now, label: "Last 90 days" };
    case "ytd":
      return { key: k, from: new Date(Date.UTC(now.getUTCFullYear(), 0, 1)), to: now, label: "This year" };
    case "all":
      return { key: k, label: "All time" };
    case "custom": {
      const f = fromS && /^\d{4}-\d{2}-\d{2}$/.test(fromS) ? new Date(`${fromS}T00:00:00Z`) : undefined;
      const t = toS && /^\d{4}-\d{2}-\d{2}$/.test(toS) ? new Date(`${toS}T23:59:59.999Z`) : undefined;
      if (!f && !t) return { key: "30d", from: ago(30), to: now, label: "Last 30 days" };
      return { key: k, from: f, to: t, label: `${fromS ?? "…"} → ${toS ?? "…"}` };
    }
  }
}

/** Now ± n days (helper keeps impure clock reads out of component bodies). */
export const daysFromNow = (n: number) => new Date(Date.now() + n * 86400_000);
