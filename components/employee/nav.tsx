"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const ITEMS = [
  ["/employee", "Today"],
  ["/employee/leave", "Leave"],
  ["/employee/timesheets", "Timesheets"],
  ["/employee/performance", "Performance"],
  ["/employee/documents", "Documents"],
  ["/employee/profile", "Profile"],
] as const;

export function PortalNav() {
  const path = usePathname();
  return (
    <nav aria-label="Employee portal" className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-4">
      {ITEMS.map(([href, label]) => {
        const active = href === "/employee" ? path === href : path.startsWith(href);
        return (
          <Link key={href} href={href} aria-current={active ? "page" : undefined} className={cn("whitespace-nowrap border-b-2 px-3 py-2 text-sm", active ? "border-brand-blue text-fg" : "border-transparent text-muted hover:text-fg")}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
