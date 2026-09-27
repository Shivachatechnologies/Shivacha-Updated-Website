"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const ITEMS = [
  ["/client/dashboard", "Dashboard"],
  ["/client/projects", "Projects"],
  ["/client/proposals", "Proposals"],
  ["/client/contracts", "Contracts"],
  ["/client/invoices", "Invoices"],
  ["/client/payments", "Payments"],
  ["/client/documents", "Documents"],
  ["/client/support", "Support"],
  ["/client/messages", "Messages"],
  ["/client/profile", "Profile"],
] as const;

export function PortalNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Client portal" className="-mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      {ITEMS.map(([href, label]) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link key={href} href={href} aria-current={active ? "page" : undefined} className={cn("rounded-md px-2.5 py-1.5 text-[13px] whitespace-nowrap", active ? "bg-ink-800 font-medium text-fg" : "text-muted hover:bg-ink-850 hover:text-fg")}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
