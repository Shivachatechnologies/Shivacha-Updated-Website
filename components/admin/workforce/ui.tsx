import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Badge } from "../ui";

const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("") || "?";

/** Photo or initials. Real photo URLs only; no generated faces. */
export function Avatar({ name, src, size = 32, className }: { name: string; src?: string | null; size?: number; className?: string }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" width={size} height={size} className={cn("shrink-0 rounded-full object-cover", className)} style={{ width: size, height: size }} />
  ) : (
    <span aria-hidden className={cn("inline-flex shrink-0 items-center justify-center rounded-full bg-ink-800 font-semibold text-muted", className)} style={{ width: size, height: size, fontSize: Math.max(10, size * 0.36) }}>
      {initials(name)}
    </span>
  );
}

const STATE: Record<string, [string, "gray" | "blue" | "green" | "amber" | "red" | "violet"]> = {
  WORKING: ["Working", "green"],
  ON_BREAK: ["On break", "amber"],
  AWAY: ["Away", "amber"],
  CHECKED_OUT: ["Checked out", "gray"],
  ON_LEAVE: ["On leave", "violet"],
  HOLIDAY: ["Holiday", "violet"],
  NOT_CHECKED_IN: ["Not checked in", "gray"],
  ABSENT: ["Absent", "red"],
  OFF_DAY: ["Off day", "gray"],
  HALF_DAY: ["Half day", "amber"],
};

export function AttendanceBadge({ state }: { state: string }) {
  const [text, tone] = STATE[state] ?? [state, "gray"];
  return <Badge tone={tone}>{text}</Badge>;
}

const GEO: Record<string, [string, "gray" | "green" | "amber" | "red"]> = { INSIDE: ["Inside geofence", "green"], OUTSIDE: ["Outside geofence", "red"], NO_LOCATION: ["No location", "amber"], NOT_REQUIRED: ["Not required", "gray"] };
export function GeofenceBadge({ value }: { value: string | null | undefined }) {
  if (!value) return <span className="text-dim">—</span>;
  const [t, tone] = GEO[value] ?? [value, "gray"];
  return <Badge tone={tone}>{t}</Badge>;
}

export function PersonCell({ name, sub, src, href }: { name: string; sub?: ReactNode; src?: string | null; href?: string }) {
  const body = (
    <span className="flex min-w-0 items-center gap-2.5">
      <Avatar name={name} src={src} size={28} />
      <span className="min-w-0">
        <span className="block truncate font-medium text-fg">{name}</span>
        {sub && <span className="block truncate text-xs text-dim">{sub}</span>}
      </span>
    </span>
  );
  return href ? <a href={href} className="block max-w-[260px] hover:[&_span.font-medium]:text-brand-blue">{body}</a> : body;
}

/** Shows that nothing here is a guess: the number is counted from records, or says "No data yet." */
export function NoData({ children = "No data yet." }: { children?: ReactNode }) {
  return <p className="py-6 text-center text-sm text-dim">{children}</p>;
}
