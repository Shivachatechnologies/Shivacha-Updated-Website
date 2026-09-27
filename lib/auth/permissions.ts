/**
 * Role-based access control. This matrix is the single source of truth and is enforced server-side
 * (layouts, pages, server actions and route handlers). The UI only reads it to hide what a role cannot use.
 */
export const ROLES = ["SUPER_ADMIN", "ADMIN", "MARKETING_MANAGER", "SALES_MANAGER", "SEO_MANAGER", "CONTENT_MANAGER"] as const;
export type RoleName = (typeof ROLES)[number];

export const PERMISSIONS = [
  "dashboard:view",
  "leads:view",
  "leads:edit",
  "leads:assign",
  "leads:archive",
  "leads:export",
  "followups:manage",
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
  "users:manage",
  "settings:manage",
  "audit:view",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ALL = [...PERMISSIONS];

export const ROLE_PERMISSIONS: Record<RoleName, readonly Permission[]> = {
  SUPER_ADMIN: ALL,
  // Operational administration: everything, but cannot manage Super Admin accounts (enforced in user actions).
  ADMIN: ALL,
  MARKETING_MANAGER: ["dashboard:view", "leads:view", "leads:export", "services:manage", "products:manage", "pages:manage", "blog:manage", "caseStudies:manage", "seo:manage", "media:manage"],
  SALES_MANAGER: ["dashboard:view", "leads:view", "leads:edit", "leads:assign", "leads:archive", "leads:export", "followups:manage"],
  SEO_MANAGER: ["dashboard:view", "seo:manage", "pages:manage", "blog:manage", "redirects:manage"],
  CONTENT_MANAGER: ["dashboard:view", "pages:manage", "services:manage", "products:manage", "blog:manage", "caseStudies:manage", "industries:manage", "technologies:manage", "faqs:manage", "media:manage"],
};

export const can = (role: RoleName | undefined | null, p: Permission) => !!role && ROLE_PERMISSIONS[role].includes(p);

export const ROLE_LABELS: Record<RoleName, string> = {
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Admin",
  MARKETING_MANAGER: "Marketing Manager",
  SALES_MANAGER: "Sales Manager",
  SEO_MANAGER: "SEO Manager",
  CONTENT_MANAGER: "Content Manager",
};

/** Roles a given actor may assign. Only Super Admins can create or promote Super Admins. */
export const assignableRoles = (actor: RoleName): RoleName[] => (actor === "SUPER_ADMIN" ? [...ROLES] : ROLES.filter((r) => r !== "SUPER_ADMIN"));
