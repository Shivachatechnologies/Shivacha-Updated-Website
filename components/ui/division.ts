import type { DivisionId } from "@/data/types";

/** Visual tokens per division. Kept here so all division styling stays consistent. */
export const divisionTone: Record<DivisionId | "product", { text: string; bg: string; border: string; dot: string; hex: string }> = {
  ai: { text: "text-brand-violet", bg: "bg-brand-violet/10", border: "border-brand-violet/30", dot: "bg-brand-violet", hex: "#8e6bff" },
  digital: { text: "text-brand-blue", bg: "bg-brand-blue/10", border: "border-brand-blue/30", dot: "bg-brand-blue", hex: "#4c82ff" },
  fintech: { text: "text-brand-emerald", bg: "bg-brand-emerald/10", border: "border-brand-emerald/30", dot: "bg-brand-emerald", hex: "#1fc38e" },
  web3: { text: "text-brand-cyan", bg: "bg-brand-cyan/10", border: "border-brand-cyan/30", dot: "bg-brand-cyan", hex: "#2fd6ee" },
  cloud: { text: "text-brand-sky", bg: "bg-brand-sky/10", border: "border-brand-sky/30", dot: "bg-brand-sky", hex: "#48b8fa" },
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
