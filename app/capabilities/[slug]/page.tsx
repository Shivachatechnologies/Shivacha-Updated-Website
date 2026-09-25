import { notFound } from "next/navigation";
import { capabilities, getCapability, getDivision } from "@/data/capabilities";
import { buildMetadata } from "@/lib/seo";
import { CapabilityTemplate } from "@/components/templates/CapabilityTemplate";

type P = { params: Promise<{ slug: string }> };

export const dynamicParams = false;
export const generateStaticParams = () => capabilities.map((c) => ({ slug: c.division }));

export async function generateMetadata({ params }: P) {
  const { slug } = await params;
  const cap = getCapability(slug);
  if (!cap) return {};
  return buildMetadata({ title: cap.metaTitle, description: cap.metaDescription, path: `/capabilities/${slug}` });
}

export default async function Page({ params }: P) {
  const { slug } = await params;
  const cap = getCapability(slug);
  if (!cap) notFound();
  return <CapabilityTemplate cap={cap} division={getDivision(cap.division)} />;
}
