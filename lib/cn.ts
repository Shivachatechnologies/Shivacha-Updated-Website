export const cn = (...classes: (string | false | null | undefined)[]) => classes.filter(Boolean).join(" ");

/**
 * Lower-cases a name for use mid-sentence without breaking acronyms and brand casing:
 * "AI Development" → "AI development", "DeFi Protocol Development" → "DeFi protocol development".
 */
export function lowerName(name: string) {
  return name.replace(/\b[A-Z][a-z]+\b/g, (w) => w.toLowerCase());
}
