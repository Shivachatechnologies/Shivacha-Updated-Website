import { z } from "zod";

/** Alert-rule conditions. All conditions that are set must match (AND). */
export const ruleConditionsSchema = z.object({
  minIntent: z.number().int().min(0).max(100).nullable().optional(),
  countries: z.array(z.string().trim().max(60)).optional(),
  pathContains: z.string().trim().max(200).nullable().optional(),
  returning: z.boolean().optional(),
  identifiedCompany: z.boolean().optional(),
  industries: z.array(z.string().trim().max(80)).optional(),
});
export type RuleConditions = z.infer<typeof ruleConditionsSchema>;

export interface RuleSubject {
  intentScore: number;
  country: string | null;
  sessionsCount: number;
  paths: string[];
  company: { name: string; industry: string | null } | null;
}

const norm = (v: string) => v.trim().toLowerCase();

export function matchRule(c: RuleConditions, v: RuleSubject): boolean {
  if (c.minIntent != null && v.intentScore < c.minIntent) return false;
  if (c.countries?.length && !(v.country && c.countries.map(norm).includes(norm(v.country)))) return false;
  if (c.pathContains && !v.paths.some((p) => p.toLowerCase().includes(c.pathContains!.toLowerCase()))) return false;
  if (c.returning && v.sessionsCount < 2) return false;
  if (c.identifiedCompany && !v.company) return false;
  if (c.industries?.length && !(v.company?.industry && c.industries.map(norm).includes(norm(v.company.industry)))) return false;
  return true;
}

export function describeRule(c: RuleConditions): string {
  const parts: string[] = [];
  if (c.minIntent != null) parts.push(`intent ≥ ${c.minIntent}`);
  if (c.countries?.length) parts.push(`country in ${c.countries.join(", ")}`);
  if (c.pathContains) parts.push(`visited a page containing “${c.pathContains}”`);
  if (c.returning) parts.push("returning visitor");
  if (c.identifiedCompany) parts.push("company identified");
  if (c.industries?.length) parts.push(`industry in ${c.industries.join(", ")}`);
  return parts.length ? parts.join(" and ") : "every visitor";
}
