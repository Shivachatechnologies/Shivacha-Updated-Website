import type { Permission } from "@/lib/auth/permissions";
import type { FeatureFlag } from "@/lib/os/flags";

export interface AdminNavItem {
  label: string;
  href: string;
  icon: string;
  permission: Permission;
  flag?: FeatureFlag;
}

export interface AdminNavGroup {
  title?: string;
  /** Icon for the module in the collapsed (icon-only) sidebar. */
  icon?: string;
  flag?: FeatureFlag;
  items: AdminNavItem[];
}

/** Shivacha OS navigation. Items are filtered server-side by permission and feature flag. */
export const ADMIN_NAV: AdminNavGroup[] = [
  {
    title: "Overview",
    items: [
      { label: "Dashboard", href: "/admin/dashboard", icon: "LayoutDashboard", permission: "dashboard:view" },
      { label: "Executive", href: "/admin/executive", icon: "Gauge", permission: "executive:view" },
      { label: "Notifications", href: "/admin/notifications", icon: "Bell", permission: "dashboard:view" },
    ],
  },
  {
    title: "Human Workforce",
    icon: "IdCard",
    items: [
      { label: "Employees", href: "/admin/employees", icon: "IdCard", permission: "employees:view" },
      { label: "My Team", href: "/admin/team", icon: "UserCheck", permission: "team:view" },
      { label: "Attendance", href: "/admin/attendance", icon: "Clock", permission: "attendance:view" },
      { label: "Live Workforce", href: "/admin/attendance/live", icon: "Radio", permission: "attendance:view" },
      { label: "Leave", href: "/admin/leave", icon: "CalendarOff", permission: "leave:view" },
      { label: "Timesheets", href: "/admin/timesheets", icon: "Timer", permission: "timesheets:view" },
      { label: "Goals & Reviews", href: "/admin/performance/goals", icon: "Target", permission: "performance:view" },
      { label: "Departments", href: "/admin/employees/departments", icon: "Network", permission: "employees:view" },
      { label: "Shifts", href: "/admin/employees/shifts", icon: "CalendarDays", permission: "attendance:view" },
      { label: "Announcements", href: "/admin/announcements", icon: "Megaphone", permission: "employees:manage" },
      { label: "My Workspace", href: "/employee", icon: "UserCheck", permission: "selfservice:use" },
    ],
  },
  {
    title: "Website Intelligence",
    icon: "Globe",
    items: [
      { label: "Visitors", href: "/admin/visitors", icon: "Eye", permission: "visitors:view" },
      { label: "Live Visitors", href: "/admin/visitors/live", icon: "Radio", permission: "visitors:view" },
      { label: "Geography", href: "/admin/visitors/geo", icon: "MapPin", permission: "visitors:view" },
      { label: "Attribution", href: "/admin/marketing/attribution", icon: "Route", permission: "visitors:view" },
      { label: "Alert Rules", href: "/admin/visitors/rules", icon: "Bell", permission: "visitors:manage" },
    ],
  },
  {
    title: "CRM",
    icon: "Inbox",
    items: [
      { label: "Leads", href: "/admin/leads", icon: "Inbox", permission: "leads:view" },
      { label: "Pipeline", href: "/admin/crm/pipeline", icon: "Columns3", permission: "leads:view", flag: "ADVANCED_CRM" },
      { label: "Activities", href: "/admin/crm/activities", icon: "Activity", permission: "leads:view", flag: "ADVANCED_CRM" },
      { label: "Follow-ups", href: "/admin/follow-ups", icon: "CalendarClock", permission: "followups:manage" },
      { label: "Duplicates", href: "/admin/crm/duplicates", icon: "Copy", permission: "leads:merge", flag: "ADVANCED_CRM" },
      { label: "Import", href: "/admin/crm/import", icon: "Upload", permission: "leads:import", flag: "ADVANCED_CRM" },
    ],
  },
  {
    title: "Sales",
    icon: "Handshake",
    flag: "SALES_PIPELINE",
    items: [
      { label: "Deals", href: "/admin/deals", icon: "Handshake", permission: "deals:view" },
      { label: "Proposals", href: "/admin/proposals", icon: "FileSignature", permission: "proposals:view", flag: "PROPOSALS" },
      { label: "Quotes", href: "/admin/quotes", icon: "Receipt", permission: "proposals:view", flag: "PROPOSALS" },
      { label: "Contracts", href: "/admin/contracts", icon: "ScrollText", permission: "contracts:view", flag: "PROPOSALS" },
    ],
  },
  {
    title: "Clients",
    icon: "Building",
    items: [
      { label: "Clients", href: "/admin/clients", icon: "Building", permission: "clients:view" },
      { label: "Contacts", href: "/admin/contacts", icon: "Contact", permission: "clients:view" },
      { label: "Documents", href: "/admin/documents", icon: "FolderOpen", permission: "clients:view" },
      { label: "Client Portal", href: "/admin/portal-users", icon: "KeyRound", permission: "portal:manage", flag: "CLIENT_PORTAL" },
    ],
  },
  {
    title: "Projects",
    icon: "FolderKanban",
    flag: "PROJECTS",
    items: [
      { label: "Projects", href: "/admin/projects", icon: "FolderKanban", permission: "projects:view" },
      { label: "Tasks", href: "/admin/tasks", icon: "ListChecks", permission: "projects:view" },
      { label: "Milestones", href: "/admin/milestones", icon: "Flag", permission: "projects:view" },
      { label: "Issues", href: "/admin/issues", icon: "Bug", permission: "projects:view" },
      { label: "Change Requests", href: "/admin/change-requests", icon: "GitPullRequest", permission: "projects:view" },
    ],
  },
  {
    title: "Finance",
    icon: "Landmark",
    flag: "FINANCE",
    items: [
      { label: "Revenue", href: "/admin/finance", icon: "TrendingUp", permission: "finance:view" },
      { label: "Invoices", href: "/admin/finance/invoices", icon: "FileText", permission: "finance:view" },
      { label: "Payments", href: "/admin/finance/payments", icon: "Wallet", permission: "finance:view" },
      { label: "Credit Notes", href: "/admin/finance/credit-notes", icon: "ReceiptText", permission: "finance:view" },
      { label: "Expenses", href: "/admin/finance/expenses", icon: "CreditCard", permission: "finance:view" },
    ],
  },
  {
    title: "Marketing",
    icon: "Megaphone",
    items: [
      { label: "Analytics", href: "/admin/marketing", icon: "BarChart3", permission: "marketing:view", flag: "MARKETING_ANALYTICS" },
      { label: "Campaigns", href: "/admin/marketing/campaigns", icon: "Megaphone", permission: "marketing:view", flag: "MARKETING_ANALYTICS" },
      { label: "Landing Pages", href: "/admin/marketing/landing-pages", icon: "PanelsTopLeft", permission: "marketing:view", flag: "MARKETING_ANALYTICS" },
      { label: "SEO", href: "/admin/seo", icon: "Search", permission: "seo:manage" },
      { label: "Redirects", href: "/admin/redirects", icon: "ArrowRightLeft", permission: "redirects:manage" },
    ],
  },
  {
    title: "Communication",
    icon: "MessagesSquare",
    flag: "COMMUNICATION",
    items: [
      { label: "Timeline", href: "/admin/communication", icon: "MessagesSquare", permission: "communication:view" },
      { label: "Email", href: "/admin/communication/email", icon: "Mail", permission: "communication:view" },
      { label: "WhatsApp", href: "/admin/communication/whatsapp", icon: "MessageCircle", permission: "communication:view" },
      { label: "Calls", href: "/admin/communication/calls", icon: "Phone", permission: "calls:view", flag: "IVR" },
      { label: "Meetings", href: "/admin/communication/meetings", icon: "Video", permission: "communication:view" },
    ],
  },
  {
    title: "Support",
    icon: "LifeBuoy",
    items: [
      { label: "Tickets", href: "/admin/support", icon: "LifeBuoy", permission: "support:view", flag: "SUPPORT" },
      { label: "Knowledge Base", href: "/admin/knowledge", icon: "BookOpen", permission: "knowledge:view" },
    ],
  },
  {
    title: "AI Workforce",
    icon: "BrainCircuit",
    flag: "AI_WORKFORCE",
    items: [
      { label: "CEO Command Center", href: "/admin/ai/command-center", icon: "Gauge", permission: "ai:view" },
      { label: "AI Employees", href: "/admin/ai/employees", icon: "Contact", permission: "ai:view" },
      { label: "Tasks", href: "/admin/ai/tasks", icon: "ListTodo", permission: "ai:view" },
      { label: "Approvals", href: "/admin/ai/approvals", icon: "ShieldCheck", permission: "ai:view" },
      { label: "Performance", href: "/admin/ai/performance", icon: "Trophy", permission: "ai:view" },
      { label: "Ask an Employee", href: "/admin/ai", icon: "Bot", permission: "ai:view" },
      { label: "Talk (Voice)", href: "/admin/ai/voice", icon: "Mic", permission: "voice:use" },
      { label: "Conversations", href: "/admin/ai/conversations", icon: "AudioLines", permission: "ai:view" },
      { label: "Control Center", href: "/admin/ai/settings", icon: "ToggleRight", permission: "ai:view" },
      { label: "Agent Config", href: "/admin/ai/agents", icon: "Users2", permission: "ai:view" },
      { label: "Insights", href: "/admin/ai/insights", icon: "Lightbulb", permission: "ai:view" },
      { label: "AI Costs", href: "/admin/ai/costs", icon: "Coins", permission: "ai:view" },
      { label: "AI Logs", href: "/admin/ai/logs", icon: "ScrollText", permission: "ai:view" },
    ],
  },
  {
    title: "Automations",
    icon: "Workflow",
    flag: "AUTOMATIONS",
    items: [
      { label: "Workflows", href: "/admin/automations", icon: "Workflow", permission: "automations:view" },
      { label: "Runs", href: "/admin/automations/runs", icon: "History", permission: "automations:view" },
      { label: "Failures", href: "/admin/automations/failures", icon: "AlertTriangle", permission: "automations:view" },
    ],
  },
  {
    title: "Insights",
    icon: "FileBarChart",
    items: [
      { label: "Reports", href: "/admin/reports", icon: "FileBarChart", permission: "reports:view" },
      { label: "Performance", href: "/admin/performance", icon: "Trophy", permission: "performance:view" },
    ],
  },
  {
    title: "Platform",
    icon: "Server",
    items: [
      { label: "Integrations", href: "/admin/integrations", icon: "Plug", permission: "integrations:view", flag: "INTEGRATIONS" },
      { label: "Security", href: "/admin/security", icon: "Lock", permission: "security:view" },
      { label: "System Health", href: "/admin/system", icon: "HeartPulse", permission: "system:view" },
    ],
  },
  {
    title: "Content",
    icon: "Layers",
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
      { label: "Navigation", href: "/admin/navigation", icon: "ListTree", permission: "navigation:manage" },
    ],
  },
  {
    title: "Settings",
    icon: "Settings",
    items: [
      { label: "Settings", href: "/admin/settings", icon: "Settings", permission: "settings:manage" },
      { label: "Feature Flags", href: "/admin/settings/features", icon: "ToggleRight", permission: "settings:manage" },
      { label: "Users", href: "/admin/users", icon: "Users", permission: "users:manage" },
      { label: "Permissions", href: "/admin/settings/permissions", icon: "ShieldCheck", permission: "users:manage" },
      { label: "Workforce Policy", href: "/admin/settings/workforce", icon: "Clock", permission: "attendance:manage" },
      { label: "Offices & Geofences", href: "/admin/settings/offices", icon: "MapPin", permission: "attendance:manage" },
      { label: "Visitor Tracking", href: "/admin/settings/visitor-tracking", icon: "Eye", permission: "visitors:manage" },
      { label: "Audit Logs", href: "/admin/audit-logs", icon: "ScrollText", permission: "audit:view" },
    ],
  },
];

export interface QuickCreateItem {
  label: string;
  href: string;
  icon: string;
  permission: Permission;
  flag?: FeatureFlag;
}

/** Top-bar "Create" menu. Same permission and feature-flag rules as the pages it opens. */
export const QUICK_CREATE: QuickCreateItem[] = [
  { label: "New lead", href: "/admin/leads/new", icon: "Inbox", permission: "leads:create" },
  { label: "New deal", href: "/admin/deals/new", icon: "Handshake", permission: "deals:manage", flag: "SALES_PIPELINE" },
  { label: "New proposal", href: "/admin/proposals/new", icon: "FileSignature", permission: "proposals:manage", flag: "PROPOSALS" },
  { label: "New quote", href: "/admin/quotes/new", icon: "Receipt", permission: "proposals:manage", flag: "PROPOSALS" },
  { label: "New employee", href: "/admin/employees/new", icon: "IdCard", permission: "employees:manage" },
  { label: "New client", href: "/admin/clients/new", icon: "Building", permission: "clients:manage" },
  { label: "New project", href: "/admin/projects/new", icon: "FolderKanban", permission: "projects:manage", flag: "PROJECTS" },
  { label: "New invoice", href: "/admin/finance/invoices/new", icon: "FileText", permission: "finance:manage", flag: "FINANCE" },
];

/** Every route prefix mapped to its feature flag, used to block disabled modules server-side. */
export const FLAGGED_PREFIXES: [string, FeatureFlag][] = ADMIN_NAV.flatMap((g) => g.items.filter((i) => i.flag ?? g.flag).map((i) => [i.href, (i.flag ?? g.flag)!] as [string, FeatureFlag]));
