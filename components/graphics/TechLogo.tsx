import { techLogo } from "@/lib/brand/techLogos";
import { cn } from "@/lib/cn";

function luminance(hex: string) {
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Brand logo for a technology slug; falls back to a lettermark when no logo is available. */
export function TechLogo({ slug, name, className, mono }: { slug: string; name: string; className?: string; mono?: boolean }) {
  const icon = techLogo[slug];
  if (!icon) {
    const letters = name.replace(/[^A-Za-z0-9 ]/g, "").split(/\s+/).map((w) => w[0]).join("").slice(0, 3).toUpperCase();
    return (
      <span className={cn("inline-flex items-center justify-center rounded-md bg-tint/[0.08] font-mono text-[9px] font-semibold text-muted", className)} aria-hidden>
        {letters}
      </span>
    );
  }
  const l = luminance(icon.hex);
  const useCurrent = mono || l < 0.18 || l > 0.9;
  return (
    <svg viewBox="0 0 24 24" className={cn("shrink-0", className)} fill={useCurrent ? "currentColor" : `#${icon.hex}`} aria-hidden>
      <path d={icon.path} />
    </svg>
  );
}

export const hasTechLogo = (slug: string) => slug in techLogo;
