import { siteConfig } from "@/data/siteConfig";

export type WhatsAppLine = (typeof siteConfig.whatsappLines)[number];
export const whatsappLines = siteConfig.whatsappLines;

/** wa.me link for one of our WhatsApp lines (India by default), with an optional prefilled message. */
export function whatsappHref(text?: string, lineId: string = "in") {
  const line = whatsappLines.find((l) => l.id === lineId) ?? whatsappLines[0];
  return `https://wa.me/${line.number}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

/** Best line for the visitor, from their time zone (browser only). */
export function suggestedLineId(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    if (tz.startsWith("America/")) return "us";
    if (tz.startsWith("Europe/") || tz.startsWith("Atlantic/") || tz.startsWith("Africa/")) return "uk";
  } catch {
    /* default below */
  }
  return "in";
}
