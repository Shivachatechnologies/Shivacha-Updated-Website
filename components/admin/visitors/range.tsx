import Link from "next/link";
import { cn } from "@/lib/cn";

export function RangeLinks({ base, days }: { base: string; days: number }) {
  return (
    <div className="flex gap-1">
      {[7, 30, 90].map((d) => (
        <Link key={d} href={`${base}?days=${d}`} aria-current={d === days ? "page" : undefined} className={cn("btn-secondary h-9 px-3 text-[13px]", d === days && "border-brand-blue text-brand-blue")}>
          {d} days
        </Link>
      ))}
    </div>
  );
}
