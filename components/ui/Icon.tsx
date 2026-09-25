import {
  Activity, ArrowRight, Banknote, Blocks, Bot, Brain, Briefcase, Building2, Cloud, CodeXml, Coins, Compass, Cpu,
  CreditCard, Database, FileText, Gamepad2, Globe, GraduationCap, HeartPulse, Hotel, House, Landmark, Layers,
  LineChart, Lock, Network, Plane, Rocket, Scale, Server, ShieldCheck, ShoppingCart, Sparkles, Sprout, Store,
  Truck, Users, Wallet, Workflow, Zap, Clapperboard, Factory, type LucideIcon,
} from "lucide-react";

const icons: Record<string, LucideIcon> = {
  Activity, ArrowRight, Banknote, Blocks, Bot, Brain, Briefcase, Building2, Cloud, CodeXml, Coins, Compass, Cpu,
  CreditCard, Database, FileText, Gamepad2, Globe, GraduationCap, HeartPulse, Hotel, House, Landmark, Layers,
  LineChart, Lock, Network, Plane, Rocket, Scale, Server, ShieldCheck, ShoppingCart, Sparkles, Sprout, Store,
  Truck, Users, Wallet, Workflow, Zap, Clapperboard, Factory,
};

export function Icon({ name, className }: { name: string; className?: string }) {
  const C = icons[name] ?? Sparkles;
  return <C className={className} aria-hidden="true" strokeWidth={1.6} />;
}

export const industryIcon: Record<string, string> = {
  fintech: "Coins", banking: "Landmark", payments: "CreditCard", insurance: "ShieldCheck", healthcare: "HeartPulse",
  ecommerce: "ShoppingCart", "real-estate": "House", logistics: "Truck", education: "GraduationCap", travel: "Plane",
  hospitality: "Hotel", media: "Clapperboard", gaming: "Gamepad2", saas: "Layers", startups: "Rocket",
  enterprise: "Building2", government: "Scale", energy: "Zap", agriculture: "Sprout",
};
