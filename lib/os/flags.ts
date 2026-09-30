import "server-only";
import { cache } from "react";
import { db } from "@/lib/db/client";

/**
 * Feature flags (Setting key "features"). Flags switch modules on or off for everyone; they never grant access —
 * permissions are always checked separately on the server.
 */
export const FEATURE_FLAGS = {
  ADVANCED_CRM: "Advanced CRM (pipeline, saved views, import, merge)",
  SALES_PIPELINE: "Sales pipeline & deals",
  PROPOSALS: "Proposals, quotes & contracts",
  FINANCE: "Finance (invoices, payments, expenses)",
  CLIENT_PORTAL: "Client portal",
  PROJECTS: "Projects & tasks",
  SUPPORT: "Support tickets",
  MARKETING_ANALYTICS: "Marketing analytics",
  AUTOMATIONS: "Automation engine",
  AI_WORKFORCE: "AI workforce",
  COMMUNICATION: "Communication center",
  IVR: "Calls & IVR",
  INTEGRATIONS: "Integration hub",
  GROWTH: "Growth department (social, demand generation, qualification)",
} as const;
export type FeatureFlag = keyof typeof FEATURE_FLAGS;
export const FLAG_KEYS = Object.keys(FEATURE_FLAGS) as FeatureFlag[];

export type Flags = Record<FeatureFlag, boolean>;
export const DEFAULT_FLAGS: Flags = Object.fromEntries(FLAG_KEYS.map((k) => [k, true])) as Flags;

export const parseFlags = (v: unknown): Flags => {
  const o = v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  return Object.fromEntries(FLAG_KEYS.map((k) => [k, typeof o[k] === "boolean" ? (o[k] as boolean) : DEFAULT_FLAGS[k]])) as Flags;
};

/** Read once per request. Falls back to defaults if the database is unavailable. */
export const getFlags = cache(async (): Promise<Flags> => {
  if (!process.env.DATABASE_URL) return DEFAULT_FLAGS;
  const row = await db.setting.findUnique({ where: { key: "features" } }).catch(() => null);
  return parseFlags(row?.value);
});

export async function isEnabled(flag: FeatureFlag) {
  return (await getFlags())[flag];
}
