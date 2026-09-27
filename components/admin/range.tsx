import Link from "next/link";
import { cn } from "@/lib/cn";
import { RANGES, type RangeKey } from "@/lib/os/range";
import { inputCls } from "./ui";

/** Date range selector (links + custom from/to form). */
export function RangePicker({ active, basePath, extra = {}, from, to }: { active: RangeKey; basePath: string; extra?: Record<string, string>; from?: string; to?: string }) {
  const q = (k: string) => new URLSearchParams({ ...extra, range: k }).toString();
  return (
    <div className="mb-5 flex flex-wrap items-center gap-1.5">
      {RANGES.filter(([k]) => k !== "custom").map(([k, l]) => (
        <Link key={k} href={`${basePath}?${q(k)}`} aria-current={active === k ? "page" : undefined} className={cn("rounded-md border px-2.5 py-1 text-[12.5px]", active === k ? "border-brand-blue bg-brand-blue/10 text-fg" : "border-line text-muted hover:text-fg")}>
          {l}
        </Link>
      ))}
      <form method="get" className="flex items-center gap-1.5">
        {Object.entries(extra).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        <input type="hidden" name="range" value="custom" />
        <input type="date" name="from" defaultValue={from} aria-label="From" className={`${inputCls} h-8 w-auto px-1.5 text-xs`} />
        <input type="date" name="to" defaultValue={to} aria-label="To" className={`${inputCls} h-8 w-auto px-1.5 text-xs`} />
        <button type="submit" className={cn("btn-secondary h-8 px-2.5 text-xs", active === "custom" && "border-brand-blue")}>Custom</button>
      </form>
    </div>
  );
}
