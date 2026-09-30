import { Tabs } from "@/components/admin/os";

const ITEMS = [
  ["growth", "Dashboard"],
  ["market", "Market intelligence"],
  ["leads", "Lead generation"],
  ["ads", "Advertising"],
  ["autonomous", "Autonomous control"],
  ["social", "Social"],
  ["demand", "Demand gen"],
  ["content", "Content"],
  ["prospects", "Prospects"],
  ["email", "Email"],
  ["partners", "Partners"],
] as const;

export function GrowthTabs({ active }: { active: (typeof ITEMS)[number][0] }) {
  return <Tabs active={active} items={ITEMS.map(([k, l]) => ({ key: k, label: l, href: `/admin/marketing/${k}` }))} />;
}

export const GROWTH_CRUMB = { label: "Growth", href: "/admin/marketing/growth" };
