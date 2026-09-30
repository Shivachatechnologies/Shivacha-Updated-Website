import "server-only";
import { db } from "@/lib/db/client";
import { parseGrowthSettings, stopReason, type GrowthScope, type GrowthSettings } from "./policy";

export const GROWTH_SETTING = "growth";

/**
 * Read fresh on every call (not request-cached): a kill switch flipped mid-run must stop the very next action.
 * If the settings cannot be read, everything autonomous is treated as off.
 */
export async function getGrowthSettings(): Promise<GrowthSettings> {
  if (!process.env.DATABASE_URL) return parseGrowthSettings({});
  const row = await db.setting.findUnique({ where: { key: GROWTH_SETTING } }).catch(() => null);
  return parseGrowthSettings(row?.value);
}

export async function growthStop(scope: GrowthScope): Promise<string | null> {
  if (!process.env.DATABASE_URL) return scope.kind === "channel" && scope.autonomous ? "Database not configured." : null;
  const row = await db.setting.findUnique({ where: { key: GROWTH_SETTING } }).catch(() => undefined);
  // Unreadable settings: fail closed for autonomous work, open for humans (who still pass every permission check).
  if (row === undefined) return scope.kind === "channel" && scope.autonomous ? "Growth settings could not be read." : null;
  return stopReason(parseGrowthSettings(row?.value), scope);
}
