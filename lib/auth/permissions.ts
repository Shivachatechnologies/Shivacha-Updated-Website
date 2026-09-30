/**
 * Role-based access control. This matrix is the single source of truth and is enforced server-side
 * (layouts, pages, server actions, route handlers and every AI tool). The UI only reads it to hide what a role cannot use.
 */
export const ROLES = [
  "SUPER_ADMIN", "ADMIN", "MARKETING_MANAGER", "SALES_MANAGER", "SEO_MANAGER", "CONTENT_MANAGER", "FINANCE_MANAGER", "PROJECT_MANAGER", "SUPPORT_MANAGER",
  // Human workforce
  "HR_ADMIN", "HR_MANAGER", "DEPARTMENT_HEAD", "TEAM_MANAGER", "EMPLOYEE", "CONTRACTOR", "INTERN",
] as const;
export type RoleName = (typeof ROLES)[number];

export const PERMISSIONS = [
  "dashboard:view",
  "executive:view",
  // CRM
  "leads:view",
  "leads:create",
  "leads:edit",
  "leads:assign",
  "leads:archive",
  "leads:export",
  "leads:import",
  "leads:merge",
  "followups:manage",
  // Sales
  "deals:view",
  "deals:manage",
  "proposals:view",
  "proposals:manage",
  "proposals:approve",
  "contracts:view",
  "contracts:manage",
  // Clients
  "clients:view",
  "clients:manage",
  "portal:manage",
  // Delivery
  "projects:view",
  "projects:manage",
  // Finance
  "finance:view",
  "finance:manage",
  "payments:confirm",
  "refunds:issue",
  // Support
  "support:view",
  "support:manage",
  // Marketing & communication
  "marketing:view",
  "marketing:manage",
  // Growth department (autonomous marketing, social, lead generation)
  "growth:view",
  "growth:manage",
  /** Autonomous mode, channel toggles, kill switches and budgets. Humans only — no AI tool can use it. */
  "growth:control",
  "communication:view",
  "communication:send",
  "calls:view",
  // People (sales/support performance and human performance reviews)
  "performance:view",
  "performance:manage",
  // Human workforce
  "employees:view",
  "employees:manage",
  "employees:archive",
  "employees:export",
  "compensation:view",
  "compensation:manage",
  "employeeDocs:view",
  "employeeDocs:manage",
  "attendance:view",
  "attendance:manage",
  "attendance:override",
  "attendance:location",
  "leave:view",
  "leave:approve",
  "leave:manage",
  "timesheets:view",
  "timesheets:approve",
  /** Managers: only their own reporting line (record-level scope enforced server-side). */
  "team:view",
  /** Employee self-service portal (/employee). */
  "selfservice:use",
  // Website visitor intelligence
  "visitors:view",
  "visitors:export",
  "visitors:manage",
  // Automation & AI
  "automations:view",
  "automations:manage",
  "ai:view",
  "ai:execute",
  "ai:approve",
  "ai:configure",
  "voice:use",
  // Knowledge & reports
  "knowledge:view",
  "knowledge:manage",
  "reports:view",
  // Content (CMS)
  "services:manage",
  "products:manage",
  "pages:manage",
  "blog:manage",
  "caseStudies:manage",
  "industries:manage",
  "technologies:manage",
  "faqs:manage",
  "media:manage",
  "seo:manage",
  "redirects:manage",
  "navigation:manage",
  // System
  "integrations:view",
  "integrations:manage",
  "security:view",
  "security:manage",
  "system:view",
  "users:manage",
  "settings:manage",
  "audit:view",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ALL = [...PERMISSIONS];
const AI_USER: Permission[] = ["ai:view", "ai:execute", "voice:use"];
const SELF: Permission[] = ["selfservice:use"];
const HR_CORE: Permission[] = [
  "dashboard:view", "employees:view", "employees:manage", "employees:export", "employeeDocs:view", "employeeDocs:manage", "attendance:view", "attendance:manage", "attendance:location",
  "leave:view", "leave:approve", "leave:manage", "timesheets:view", "timesheets:approve", "performance:view", "performance:manage", "team:view", "reports:view", "knowledge:view", ...SELF,
];

export const ROLE_PERMISSIONS: Record<RoleName, readonly Permission[]> = {
  SUPER_ADMIN: ALL,
  // Operational administration: everything, but cannot manage Super Admin accounts (enforced in user actions).
  ADMIN: ALL,
  MARKETING_MANAGER: ["dashboard:view", "leads:view", "leads:export", "services:manage", "products:manage", "pages:manage", "blog:manage", "caseStudies:manage", "seo:manage", "media:manage", "marketing:view", "marketing:manage", "growth:view", "growth:manage", "communication:view", "knowledge:view", "reports:view", "visitors:view", "visitors:export", ...AI_USER, ...SELF],
  SALES_MANAGER: [
    "dashboard:view", "leads:view", "leads:create", "leads:edit", "leads:assign", "leads:archive", "leads:export", "leads:import", "leads:merge", "followups:manage",
    "deals:view", "deals:manage", "proposals:view", "proposals:manage", "proposals:approve", "contracts:view", "clients:view",
    "communication:view", "communication:send", "calls:view", "performance:view", "knowledge:view", "reports:view", "marketing:view", "growth:view", "visitors:view", ...AI_USER, "ai:approve", ...SELF,
  ],
  SEO_MANAGER: ["dashboard:view", "seo:manage", "pages:manage", "blog:manage", "redirects:manage", "marketing:view", "growth:view", "knowledge:view", ...AI_USER, ...SELF],
  CONTENT_MANAGER: ["dashboard:view", "pages:manage", "services:manage", "products:manage", "blog:manage", "caseStudies:manage", "industries:manage", "technologies:manage", "faqs:manage", "media:manage", "knowledge:view", "knowledge:manage", ...AI_USER, ...SELF],
  FINANCE_MANAGER: [
    "dashboard:view", "finance:view", "finance:manage", "payments:confirm", "refunds:issue", "clients:view", "deals:view", "proposals:view", "contracts:view", "contracts:manage",
    "projects:view", "communication:view", "knowledge:view", "reports:view", ...AI_USER, "ai:approve", "compensation:view", "timesheets:view", ...SELF,
  ],
  PROJECT_MANAGER: [
    "dashboard:view", "projects:view", "projects:manage", "clients:view", "support:view", "communication:view", "communication:send", "knowledge:view", "performance:view", "reports:view", ...AI_USER, "ai:approve", "timesheets:view", ...SELF,
  ],
  SUPPORT_MANAGER: [
    "dashboard:view", "support:view", "support:manage", "clients:view", "projects:view", "knowledge:view", "knowledge:manage", "communication:view", "communication:send", "calls:view", "performance:view", "reports:view", ...AI_USER, "ai:approve", ...SELF,
  ],
  // HR Admin: the whole people function including pay, attendance overrides and archiving.
  HR_ADMIN: [...HR_CORE, "employees:archive", "compensation:view", "compensation:manage", "attendance:override", ...AI_USER],
  // HR Manager: day-to-day people operations; no compensation.
  HR_MANAGER: [...HR_CORE, ...AI_USER],
  // Managers see and approve for their own reporting line only (no HR or finance access).
  DEPARTMENT_HEAD: ["dashboard:view", "team:view", "leave:approve", "timesheets:approve", "performance:view", "projects:view", "knowledge:view", "reports:view", ...AI_USER, ...SELF],
  TEAM_MANAGER: ["dashboard:view", "team:view", "leave:approve", "timesheets:approve", "performance:view", "projects:view", "knowledge:view", ...AI_USER, ...SELF],
  EMPLOYEE: [...SELF],
  CONTRACTOR: [...SELF],
  INTERN: [...SELF],
};

/**
 * Administrator overrides from the permission matrix (RolePermission rows), loaded server-side on every authenticated
 * request (lib/auth/overrides.ts). Super Admin is never overridable; in the browser this map is empty, so client code
 * only ever sees defaults — the server remains authoritative.
 */
let OVERRIDES = new Map<string, boolean>();
const okey = (role: string, p: string) => `${role}|${p}`;
/** Permissions an override may never remove (lock-out protection). */
export const LOCKED: Partial<Record<RoleName, readonly Permission[]>> = { ADMIN: ["users:manage", "settings:manage", "dashboard:view"] };
export function setPermissionOverrides(rows: { role: string; permission: string; granted: boolean }[]) {
  OVERRIDES = new Map(rows.filter((r) => r.role !== "SUPER_ADMIN" && (PERMISSIONS as readonly string[]).includes(r.permission) && !(LOCKED[r.role as RoleName]?.includes(r.permission as Permission) && !r.granted)).map((r) => [okey(r.role, r.permission), r.granted]));
}
export const defaultCan = (role: RoleName, p: Permission) => ROLE_PERMISSIONS[role]?.includes(p) ?? false;
export const overrideOf = (role: RoleName, p: Permission) => OVERRIDES.get(okey(role, p));

export const can = (role: RoleName | undefined | null, p: Permission) => {
  if (!role) return false;
  if (role === "SUPER_ADMIN") return true;
  return OVERRIDES.get(okey(role, p)) ?? defaultCan(role, p);
};
export const canAll = (role: RoleName | undefined | null, ps: readonly Permission[]) => ps.every((p) => can(role, p));

export const ROLE_LABELS: Record<RoleName, string> = {
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Admin",
  MARKETING_MANAGER: "Marketing Manager",
  SALES_MANAGER: "Sales Manager",
  SEO_MANAGER: "SEO Manager",
  CONTENT_MANAGER: "Content Manager",
  FINANCE_MANAGER: "Finance Manager",
  PROJECT_MANAGER: "Project Manager",
  SUPPORT_MANAGER: "Support Manager",
  HR_ADMIN: "HR Admin",
  HR_MANAGER: "HR Manager",
  DEPARTMENT_HEAD: "Department Head",
  TEAM_MANAGER: "Team Manager",
  EMPLOYEE: "Employee",
  CONTRACTOR: "Contractor",
  INTERN: "Intern",
};

/** Roles a given actor may assign. Only Super Admins can create or promote Super Admins. */
export const assignableRoles = (actor: RoleName): RoleName[] => (actor === "SUPER_ADMIN" ? [...ROLES] : ROLES.filter((r) => r !== "SUPER_ADMIN"));
