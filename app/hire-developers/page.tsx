import Link from "next/link";
import { teams } from "@/data/teams";
import { buildMetadata } from "@/lib/seo";
import { ContactLayout } from "@/components/sections/ContactLayout";
import { LeadForm } from "@/components/forms/LeadForm";

export const metadata = buildMetadata({ title: "Hire Developers & Dedicated Teams", description: "Hire dedicated developers and engineering teams from Shivacha — AI, full-stack, mobile, fintech, payments, blockchain, smart contract, DevOps, cloud and security.", path: "/hire-developers" });

export default function HirePage() {
  return (
    <ContactLayout
      crumbs={[{ name: "Hire Developers", href: "/hire-developers" }]}
      eyebrow="Dedicated teams"
      title="Build your engineering team."
      lede="Tell us which roles you need and what they will own. An engineering advisor will propose a team composition and share profiles for your review."
      side={
        <div className="card p-6">
          <p className="eyebrow mb-4">Team types</p>
          <div className="flex flex-wrap gap-2">
            {teams.map((t) => (
              <Link key={t.slug} href={`/dedicated-teams/${t.slug}`} className="chip">
                {t.name}
              </Link>
            ))}
          </div>
        </div>
      }
    >
      <LeadForm type="hire" />
    </ContactLayout>
  );
}
