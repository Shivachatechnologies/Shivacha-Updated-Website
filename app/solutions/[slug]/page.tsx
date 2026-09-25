import { notFound } from "next/navigation";
import { solutions, getSolution } from "@/data/solutions";
import { buildMetadata } from "@/lib/seo";
import { SolutionTemplate } from "@/components/templates/SolutionTemplate";

type P = { params: Promise<{ slug: string }> };
export const dynamicParams = false;
export const generateStaticParams = () => solutions.map((s) => ({ slug: s.slug }));

export async function generateMetadata({ params }: P) {
  const { slug } = await params;
  const s = getSolution(slug);
  if (!s) return {};
  return buildMetadata({ title: s.slug === "web2-web3-fintech" ? "Web2 + Web3 FinTech: Hybrid Financial Infrastructure" : `${s.name} Solutions`, description: s.summary, path: `/solutions/${slug}` });
}

export default async function Page({ params }: P) {
  const { slug } = await params;
  const s = getSolution(slug);
  if (!s) notFound();
  return <SolutionTemplate solution={s} />;
}
