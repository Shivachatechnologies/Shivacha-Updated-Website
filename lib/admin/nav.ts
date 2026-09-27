import type { Permission } from "@/lib/auth/permissions";

export interface AdminNavItem {
  label: string;
  href: string;
  icon: string;
  permission: Permission;
}

export const ADMIN_NAV: { title?: string; items: AdminNavItem[] }[] = [
  { items: [{ label: "Dashboard", href: "/admin/dashboard", icon: "LayoutDashboard", permission: "dashboard:view" }] },
  {
    title: "CRM",
    items: [
      { label: "Leads", href: "/admin/leads", icon: "Inbox", permission: "leads:view" },
      { label: "Follow-ups", href: "/admin/follow-ups", icon: "CalendarClock", permission: "followups:manage" },
    ],
  },
  {
    title: "Content",
    items: [
      { label: "Pages", href: "/admin/pages", icon: "FileText", permission: "pages:manage" },
      { label: "Services", href: "/admin/services", icon: "Layers", permission: "services:manage" },
      { label: "Products", href: "/admin/products", icon: "Boxes", permission: "products:manage" },
      { label: "Blog", href: "/admin/blog", icon: "Newspaper", permission: "blog:manage" },
      { label: "Case Studies", href: "/admin/case-studies", icon: "Briefcase", permission: "caseStudies:manage" },
      { label: "Industries", href: "/admin/industries", icon: "Building2", permission: "industries:manage" },
      { label: "Technologies", href: "/admin/technologies", icon: "Cpu", permission: "technologies:manage" },
      { label: "FAQs", href: "/admin/faqs", icon: "HelpCircle", permission: "faqs:manage" },
      { label: "Media", href: "/admin/media", icon: "ImageIcon", permission: "media:manage" },
    ],
  },
  {
    title: "SEO",
    items: [
      { label: "SEO", href: "/admin/seo", icon: "Search", permission: "seo:manage" },
      { label: "Redirects", href: "/admin/redirects", icon: "ArrowRightLeft", permission: "redirects:manage" },
    ],
  },
  {
    title: "System",
    items: [
      { label: "Users", href: "/admin/users", icon: "Users", permission: "users:manage" },
      { label: "Navigation", href: "/admin/navigation", icon: "ListTree", permission: "navigation:manage" },
      { label: "Settings", href: "/admin/settings", icon: "Settings", permission: "settings:manage" },
      { label: "Audit Logs", href: "/admin/audit-logs", icon: "ScrollText", permission: "audit:view" },
    ],
  },
];
