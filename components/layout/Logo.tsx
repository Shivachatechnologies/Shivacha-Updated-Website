import Image from "next/image";
import { BRAND_BLUE, MARK_PATH, MARK_VIEWBOX } from "@/lib/brand/mark";
import { cn } from "@/lib/cn";

/** Official Shivacha mark (see public/brand). */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox={MARK_VIEWBOX} className={cn("size-8", className)} aria-hidden="true">
      <path fill={BRAND_BLUE} fillRule="evenodd" d={MARK_PATH} />
    </svg>
  );
}

/** Mark + "SHIVACHA / SIMPLIFYING TECH SOLUTIONS" wordmark, proportioned as in the official lockup. */
export function Logo({ className, size = "md" }: { className?: string; size?: "md" | "lg" }) {
  const lg = size === "lg";
  return (
    <span className={cn("flex items-center", lg ? "gap-3.5" : "gap-2.5", className)}>
      <LogoMark className={lg ? "size-12" : "size-9"} />
      <Image
        src="/brand/shivacha-wordmark.svg"
        alt="Shivacha — Simplifying Tech Solutions"
        width={lg ? 147 : 108}
        height={lg ? 30 : 22}
        unoptimized
        priority={!lg}
        className={lg ? "h-[30px] w-auto" : "h-[22px] w-auto"}
      />
    </span>
  );
}
