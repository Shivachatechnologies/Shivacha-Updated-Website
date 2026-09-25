import type { DivisionId } from "@/data/types";

/** Visual tokens per division. Kept here so all division styling stays consistent. */
export const divisionTone: Record<DivisionId | "product", { text: string; bg: string; border: string; dot: string; hex: string }> = {
  ai: { text: "text-brand-indigo", bg: "bg-brand-indigo/10", border: "border-brand-indigo/30", dot: "bg-brand-indigo", hex: "#6b7cff" },
  digital: { text: "text-brand-blue", bg: "bg-brand-blue/10", border: "border-brand-blue/30", dot: "bg-brand-blue", hex: "#0195ff" },
  fintech: { text: "text-brand-teal", bg: "bg-brand-teal/10", border: "border-brand-teal/30", dot: "bg-brand-teal", hex: "#14c8b0" },
  web3: { text: "text-brand-cyan", bg: "bg-brand-cyan/10", border: "border-brand-cyan/30", dot: "bg-brand-cyan", hex: "#22d3ee" },
  cloud: { text: "text-brand-sky", bg: "bg-brand-sky/10", border: "border-brand-sky/30", dot: "bg-brand-sky", hex: "#5cc8ff" },
  product: { text: "text-fg", bg: "bg-white/5", border: "border-line-strong", dot: "bg-fg", hex: "#e9edf5" },
};

export const divisionLabel: Record<DivisionId | "product", string> = {
  ai: "Shivacha AI",
  digital: "Shivacha Digital",
  fintech: "Shivacha FinTech",
  web3: "Shivacha Web3",
  cloud: "Shivacha Cloud",
  product: "Product & Design",
};
