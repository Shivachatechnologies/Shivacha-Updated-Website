import { notFound } from "next/navigation";
import { hireRoles, getHireRole } from "@/data/hire";
import { buildMetadata } from "@/lib/seo";
import { HireTemplate } from "@/components/templates/HireTemplate";

/** Root-level role pages, e.g. /hire-blockchain-developers. Every other root slug 404s. */
type P = { params: Promise<{ slug: string }> };
export const dynamicParams = false;
export const generateStaticParams = () => hireRoles.map((r) => ({ slug: r.slug }));

export async function generateMetadata({ params }: P) {
  const { slug } = await params;
  const r = getHireRole(slug);
  if (!r) return {};
  return buildMetadata({ title: `Hire ${r.role} — Vetted, Dedicated Engineers`, description: r.summary, path: `/${slug}` });
}

export default async function Page({ params }: P) {
  const { slug } = await params;
  const r = getHireRole(slug);
  if (!r) notFound();
  return <HireTemplate role={r} />;
}
