import "server-only";
import { db } from "@/lib/db/client";
import { AGENTS, ALL_AGENTS } from "@/lib/ai/catalog";
import { ensureEmployees } from "@/lib/ai/workforce/employees";
import { CORE_PLACEMENT, DEPARTMENTS, employeeCodes, orgEmployee, placementOf, REGIONS, type ManagerMap } from "./org";
export { getCompanyProfile, saveCompanyProfile } from "./profile";

const SYNC_KEY = "company:org-sync";
/** Bump when the placement of existing employees changes, so the one-time manager migration runs again. */
const SYNC_VERSION = 1;

/**
 * Makes the AI company exist in the database: every employee row (existing 12 + organisation), profile fields,
 * departments and regions. Idempotent and additive — it only fills empty fields, with one exception run once per
 * SYNC_VERSION: an existing employee whose manager is still its old default is moved under its new organisation
 * manager (an administrator's own choice is never overwritten).
 */
export async function ensureOrganisation() {
  await ensureEmployees();
  const codes = employeeCodes(AGENTS.map((a) => a.slug));
  const synced = await db.setting.findUnique({ where: { key: SYNC_KEY } });
  const migrateManagers = ((synced?.value as { version?: number } | null)?.version ?? 0) < SYNC_VERSION;
  const rows = await db.aIAgent.findMany({ select: { slug: true, employeeCode: true, level: true, departmentKey: true, regionKey: true, skills: true, reportsToSlug: true } });
  for (const r of rows) {
    const p = placementOf(r.slug);
    if (!p) continue;
    const data: Record<string, unknown> = {};
    if (!r.employeeCode && codes.get(r.slug)) data.employeeCode = codes.get(r.slug);
    if (!r.level) data.level = p.level;
    if (!r.departmentKey) data.departmentKey = p.department;
    if (!r.regionKey && p.region) data.regionKey = p.region;
    if (!r.skills.length) data.skills = p.skills;
    const core = CORE_PLACEMENT[r.slug];
    if (migrateManagers && core && r.reportsToSlug === core.legacyManager && core.manager !== core.legacyManager) data.reportsToSlug = core.manager;
    if (!core && !r.reportsToSlug && orgEmployee(r.slug)?.manager) data.reportsToSlug = orgEmployee(r.slug)!.manager;
    if (Object.keys(data).length) await db.aIAgent.update({ where: { slug: r.slug }, data });
  }
  for (const d of DEPARTMENTS) await db.aIDepartment.upsert({ where: { key: d.key }, update: {}, create: { key: d.key, name: d.name, headSlug: d.head, description: d.description, sort: d.sort } });
  for (const r of REGIONS) await db.aIRegion.upsert({ where: { key: r.key }, update: {}, create: { key: r.key, name: r.name, leaderSlug: r.leader, countries: r.countries } });
  if (migrateManagers) await db.setting.upsert({ where: { key: SYNC_KEY }, update: { value: { version: SYNC_VERSION, at: new Date().toISOString() } }, create: { key: SYNC_KEY, value: { version: SYNC_VERSION, at: new Date().toISOString() } } });
}

let ensured: Promise<void> | null = null;
/** ensureOrganisation once per server process (page loads call this). */
export function ensureOrganisationOnce() {
  ensured ??= ensureOrganisation().catch((e) => {
    ensured = null;
    throw e;
  });
  return ensured;
}

/** Current reporting lines from the database (what administrators set), for every known employee. */
export async function orgManagers(): Promise<ManagerMap> {
  const known = new Set(ALL_AGENTS.map((a) => a.slug));
  const rows = await db.aIAgent.findMany({ select: { slug: true, reportsToSlug: true } });
  const m: ManagerMap = new Map();
  for (const r of rows) if (known.has(r.slug)) m.set(r.slug, r.reportsToSlug && known.has(r.reportsToSlug) ? r.reportsToSlug : null);
  for (const s of known) if (!m.has(s)) m.set(s, placementOf(s)?.manager ?? null);
  return m;
}

export interface OrgNode {
  slug: string;
  code: string | null;
  name: string;
  jobTitle: string;
  level: string;
  department: string;
  region: string | null;
  manager: string | null;
  enabled: boolean;
  available: boolean;
  mode: string;
  reports: string[];
  core: boolean;
}

/** The org chart as stored (profile fields fall back to the organisation defaults). */
export async function orgChart(): Promise<OrgNode[]> {
  const [rows, managers] = await Promise.all([db.aIAgent.findMany(), orgManagers()]);
  const bySlug = new Map(rows.map((r) => [r.slug, r]));
  const core = new Set(AGENTS.map((a) => a.slug));
  return ALL_AGENTS.map((spec) => {
    const r = bySlug.get(spec.slug);
    const p = placementOf(spec.slug);
    return {
      slug: spec.slug,
      code: r?.employeeCode ?? null,
      name: r?.personaName?.trim() || spec.name.replace(/^AI\s+/, ""),
      jobTitle: r?.jobTitle ?? orgEmployee(spec.slug)?.jobTitle ?? spec.name,
      level: r?.level ?? p?.level ?? "SPECIALIST",
      department: r?.departmentKey ?? p?.department ?? "operations",
      region: r?.regionKey ?? p?.region ?? null,
      manager: managers.get(spec.slug) ?? null,
      enabled: r?.enabled ?? true,
      available: r?.available ?? true,
      mode: r?.mode ?? "ASSIST",
      reports: [...managers].filter(([, m]) => m === spec.slug).map(([s]) => s),
      core: core.has(spec.slug),
    };
  });
}
