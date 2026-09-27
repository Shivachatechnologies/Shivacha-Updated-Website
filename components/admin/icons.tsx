import { ArrowRightLeft, Boxes, Briefcase, Building2, CalendarClock, Cpu, FileText, HelpCircle, ImageIcon, Inbox, Layers, LayoutDashboard, ListTree, Newspaper, ScrollText, Search, Settings, Sparkles, Users, type LucideIcon } from "lucide-react";

const icons: Record<string, LucideIcon> = { LayoutDashboard, Inbox, CalendarClock, FileText, Layers, Boxes, Newspaper, Briefcase, Building2, Cpu, HelpCircle, ImageIcon, Search, ArrowRightLeft, Users, ListTree, Settings, ScrollText };

export function AdminIcon({ name, className }: { name: string; className?: string }) {
  const C = icons[name] ?? Sparkles;
  return <C className={className} aria-hidden strokeWidth={1.75} />;
}
