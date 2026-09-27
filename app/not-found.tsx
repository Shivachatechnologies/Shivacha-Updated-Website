import Link from "next/link";
import { Section } from "@/components/ui/primitives";
import { SiteChrome } from "@/components/layout/SiteChrome";

export default function NotFound() {
  return (
    <SiteChrome>
    <Section className="pt-40">
      <p className="eyebrow">404</p>
      <h1 className="h-page mt-4 text-gradient">This page doesn&apos;t exist.</h1>
      <p className="lede mt-5 max-w-xl">It may have moved as we reorganised the site around Web3, FinTech, Digital Assets, AI and Cloud. Try search (⌘K) or one of these:</p>
      <div className="mt-8 flex flex-wrap gap-2">
        {[
          ["Capabilities", "/capabilities"],
          ["Services", "/services"],
          ["Products", "/products"],
          ["Solutions", "/solutions"],
          ["Technologies", "/technologies"],
          ["Contact", "/contact"],
        ].map(([l, h]) => (
          <Link key={h} href={h} className="chip">
            {l}
          </Link>
        ))}
      </div>
    </Section>
    </SiteChrome>
  );
}
