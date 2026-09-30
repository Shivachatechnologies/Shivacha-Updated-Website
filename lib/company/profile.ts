import "server-only";
import { db } from "@/lib/db/client";
import { DEFAULT_PROFILE, parseCompanyProfile, type CompanyProfile } from "./org";

const PROFILE_KEY = "companyProfile";

/** Company configuration (template, departments, strict approvals, delegation limits). Read fresh on every call. */
export async function getCompanyProfile(): Promise<CompanyProfile> {
  if (!process.env.DATABASE_URL) return DEFAULT_PROFILE;
  const row = await db.setting.findUnique({ where: { key: PROFILE_KEY } }).catch(() => null);
  return parseCompanyProfile(row?.value);
}

export async function saveCompanyProfile(p: CompanyProfile) {
  const v = JSON.parse(JSON.stringify(parseCompanyProfile(p)));
  await db.setting.upsert({ where: { key: PROFILE_KEY }, update: { value: v }, create: { key: PROFILE_KEY, value: v } });
}

