/**
 * Role-based access control. This matrix is the single source of truth and is enforced server-side
 * (layouts, pages, server actions, route handlers and every AI tool). The UI only reads it to hide what a role cannot use.
 */
export const ROLES = ["SUPER_ADMIN", "ADMIN", "MARKETING_MANAGER", "SALES_MANAGER", "SEO_MANAGER", "CONTENT_MANAGER", "FINANCE_MANAGER", "PROJECT_MANAGER", "SUPPORT_MANAGER"] as const;
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
  "communication:view",
  "communication:send",
  "calls:view",
  // People
  "performance:view",
  // Automation & AI
  "automations:view",
  "automations:manage",
  "ai:view",
  "ai:execute",
  "ai:approve",
  "ai:configure",
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
const AI_USER: Permission[] = ["ai:view", "ai:execute"];

export const ROLE_PERMISSIONS: Record<RoleName, readonly Permission[]> = {
  SUPER_ADMIN: ALL,
  // Operational administration: everything, but cannot manage Super Admin accounts (enforced in user actions).
  ADMIN: ALL,
  MARKETING_MANAGER: ["dashboard:view", "leads:view", "leads:export", "services:manage", "products:manage", "pages:manage", "blog:manage", "caseStudies:manage", "seo:manage", "media:manage", "marketing:view", "marketing:manage", "communication:view", "knowledge:view", "reports:view", ...AI_USER],
  SALES_MANAGER: [
    "dashboard:view", "leads:view", "leads:create", "leads:edit", "leads:assign", "leads:archive", "leads:export", "leads:import", "leads:merge", "followups:manage",
    "deals:view", "deals:manage", "proposals:view", "proposals:manage", "proposals:approve", "contracts:view", "clients:view",
    "communication:view", "communication:send", "calls:view", "performance:view", "knowledge:view", "reports:view", "marketing:view", ...AI_USER, "ai:approve",
  ],
  SEO_MANAGER: ["dashboard:view", "seo:manage", "pages:manage", "blog:manage", "redirects:manage", "marketing:view", "knowledge:view", ...AI_USER],
  CONTENT_MANAGER: ["dashboard:view", "pages:manage", "services:manage", "products:manage", "blog:manage", "caseStudies:manage", "industries:manage", "technologies:manage", "faqs:manage", "media:manage", "knowledge:view", "knowledge:manage", ...AI_USER],
  FINANCE_MANAGER: [
    "dashboard:view", "finance:view", "finance:manage", "payments:confirm", "refunds:issue", "clients:view", "deals:view", "proposals:view", "contracts:view", "contracts:manage",
    "projects:view", "communication:view", "knowledge:view", "reports:view", ...AI_USER, "ai:approve",
  ],
  PROJECT_MANAGER: [
    "dashboard:view", "projects:view", "projects:manage", "clients:view", "support:view", "communication:view", "communication:send", "knowledge:view", "performance:view", "reports:view", ...AI_USER, "ai:approve",
  ],
  SUPPORT_MANAGER: [
    "dashboard:view", "support:view", "support:manage", "clients:view", "projects:view", "knowledge:view", "knowledge:manage", "communication:view", "communication:send", "calls:view", "performance:view", "reports:view", ...AI_USER, "ai:approve",
  ],
};

export const can = (role: RoleName | undefined | null, p: Permission) => !!role && (ROLE_PERMISSIONS[role]?.includes(p) ?? false);
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
};

/** Roles a given actor may assign. Only Super Admins can create or promote Super Admins. */
export const assignableRoles = (actor: RoleName): RoleName[] => (actor === "SUPER_ADMIN" ? [...ROLES] : ROLES.filter((r) => r !== "SUPER_ADMIN"));
