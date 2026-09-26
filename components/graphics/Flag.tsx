import { cn } from "@/lib/cn";

/** Minimal inline flags (emoji flags do not render on Windows). */
export function Flag({ code, className }: { code: "IN" | "US" | "GB"; className?: string }) {
  const cls = cn("h-4 w-6 shrink-0 overflow-hidden rounded-[3px] ring-1 ring-white/15", className);
  if (code === "IN")
    return (
      <svg viewBox="0 0 30 20" className={cls} aria-hidden>
        <rect width="30" height="20" fill="#fff" />
        <rect width="30" height="6.67" fill="#FF9933" />
        <rect y="13.33" width="30" height="6.67" fill="#138808" />
        <circle cx="15" cy="10" r="2.6" fill="none" stroke="#000080" strokeWidth=".7" />
        <circle cx="15" cy="10" r=".5" fill="#000080" />
      </svg>
    );
  if (code === "US")
    return (
      <svg viewBox="0 0 38 20" className={cls} aria-hidden>
        <rect width="38" height="20" fill="#fff" />
        {[0, 2, 4, 6, 8, 10, 12].map((i) => (
          <rect key={i} y={(i * 20) / 13} width="38" height={20 / 13} fill="#B22234" />
        ))}
        <rect width="15.2" height={(20 * 7) / 13} fill="#3C3B6E" />
      </svg>
    );
  return (
    <svg viewBox="0 0 60 30" className={cls} aria-hidden>
      <clipPath id="gb-t">
        <path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z" />
      </clipPath>
      <path d="M0,0 v30 h60 v-30 z" fill="#012169" />
      <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" strokeWidth="6" />
      <path d="M0,0 L60,30 M60,0 L0,30" clipPath="url(#gb-t)" stroke="#C8102E" strokeWidth="4" />
      <path d="M30,0 v30 M0,15 h60" stroke="#fff" strokeWidth="10" />
      <path d="M30,0 v30 M0,15 h60" stroke="#C8102E" strokeWidth="6" />
    </svg>
  );
}
