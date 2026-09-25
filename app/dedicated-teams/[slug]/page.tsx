import { notFound } from "next/navigation";
import { teams, getTeam } from "@/data/teams";
import { buildMetadata } from "@/lib/seo";
import { TeamTemplate } from "@/components/templates/TeamTemplate";

type P = { params: Promise<{ slug: string }> };
export const dynamicParams = false;
export const generateStaticParams = () => teams.map((t) => ({ slug: t.slug }));

export async function generateMetadata({ params }: P) {
  const { slug } = await params;
  const t = getTeam(slug);
  if (!t) return {};
  return buildMetadata({ title: `Dedicated ${t.name}`, description: `${t.summary} ${t.overview.slice(0, 180)}`, path: `/dedicated-teams/${slug}` });
}

export default async function Page({ params }: P) {
  const { slug } = await params;
  const t = getTeam(slug);
  if (!t) notFound();
  return <TeamTemplate team={t} />;
}
