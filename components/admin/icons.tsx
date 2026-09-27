import {
  AudioLines, CalendarDays, CalendarOff, Clock, Eye, Globe, IdCard, MapPin, Mic, Network, Radio, Route, Target, Timer, UserCheck, Activity, AlertTriangle, ArrowRightLeft, BarChart3, Bell, BookOpen, Bot, Boxes, BrainCircuit, Briefcase, Bug, Building, Building2, CalendarClock, Coins, Columns3, Contact, Copy, Cpu, CreditCard,
  FileBarChart, FileSignature, FileText, Flag, FolderKanban, FolderOpen, Gauge, GitPullRequest, Handshake, HeartPulse, HelpCircle, History, ImageIcon, Inbox, KeyRound, Landmark, Layers,
  LayoutDashboard, LifeBuoy, Lightbulb, ListChecks, ListTodo, ListTree, Lock, Mail, Megaphone, MessageCircle, MessagesSquare, Newspaper, PanelsTopLeft, Phone, Plug, Receipt,
  ReceiptText, ScrollText, Search, Server, Settings, ShieldCheck, Sparkles, ToggleRight, TrendingUp, Trophy, Upload, Users, Users2, Video, Wallet, Workflow, type LucideIcon,
} from "lucide-react";

const icons: Record<string, LucideIcon> = {
  AudioLines, CalendarDays, CalendarOff, Clock, Eye, Globe, IdCard, MapPin, Mic, Network, Radio, Route, Target, Timer, UserCheck, Activity, AlertTriangle, ArrowRightLeft, BarChart3, Bell, BookOpen, Bot, Boxes, BrainCircuit, Briefcase, Bug, Building, Building2, CalendarClock, Coins, Columns3, Contact, Copy, Cpu, CreditCard,
  FileBarChart, FileSignature, FileText, Flag, FolderKanban, FolderOpen, Gauge, GitPullRequest, Handshake, HeartPulse, HelpCircle, History, ImageIcon, Inbox, KeyRound, Landmark, Layers,
  LayoutDashboard, LifeBuoy, Lightbulb, ListChecks, ListTodo, ListTree, Lock, Mail, Megaphone, MessageCircle, MessagesSquare, Newspaper, PanelsTopLeft, Phone, Plug, Receipt,
  ReceiptText, ScrollText, Search, Server, Settings, ShieldCheck, ToggleRight, TrendingUp, Trophy, Upload, Users, Users2, Video, Wallet, Workflow,
};

export function AdminIcon({ name, className }: { name: string; className?: string }) {
  const C = icons[name] ?? Sparkles;
  return <C className={className} aria-hidden strokeWidth={1.75} />;
}
