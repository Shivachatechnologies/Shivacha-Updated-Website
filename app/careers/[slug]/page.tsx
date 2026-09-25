import { notFound } from "next/navigation";
import { careerDepartments, jobs, getDepartment, getJob } from "@/data/careers";
import { buildMetadata } from "@/lib/seo";
import { PageHero } from "@/components/sections/PageHero";
import { CTABand } from "@/components/sections/CTABand";
import { CheckList } from "@/components/sections/blocks";
import { LinkCard, Section } from "@/components/ui/primitives";
import { CareerTemplate } from "@/components/templates/ContentTemplates";

type P = { params: Promise<{ slug: string }> };
export const dynamicParams = false;
export const generateStaticParams = () => [...careerDepartments.map((d) => ({ slug: d.slug })), ...jobs.map((j) => ({ slug: j.slug }))];

export async function generateMetadata({ params }: P) {
  const { slug } = await params;
  const d = getDepartment(slug);
  if (d) return buildMetadata({ title: `${d.name} Careers`, description: d.description, path: `/careers/${slug}` });
  const j = getJob(slug);
  if (!j) return {};
  return buildMetadata({ title: `${j.title} — Careers`, description: j.summary, path: `/careers/${slug}` });
}

export default async function Page({ params }: P) {
  const { slug } = await params;
  const d = getDepartment(slug);
  if (d) {
    const list = jobs.filter((j) => j.department === d.slug);
    return (
      <>
        <PageHero crumbs={[{ name: "Careers", href: "/careers" }, { name: d.name, href: `/careers/${d.slug}` }]} eyebrow={<span className="eyebrow">Careers</span>} title={`${d.name} at Shivacha`} lede={d.description} />
        <Section bordered={false} className="pt-0">
          <p className="eyebrow mb-5">Disciplines</p>
          <CheckList items={d.disciplines} />
        </Section>
        <Section>
          <p className="eyebrow mb-6">Open tracks</p>
          {list.length ? (
            <div className="grid gap-4 md:grid-cols-2">
              {list.map((j) => (
                <LinkCard key={j.slug} href={`/careers/${j.slug}`} title={j.title} description={j.summary} eyebrow={`${j.location} · ${j.type}`} />
              ))}
            </div>
          ) : (
            <p className="text-muted">No open tracks right now. You are welcome to introduce yourself through our contact page.</p>
          )}
        </Section>
        <CTABand title="Introduce yourself." primary={{ label: "Contact us", href: "/contact" }} secondary={{ label: "All careers", href: "/careers" }} />
      </>
    );
  }
  const j = getJob(slug);
  if (!j) notFound();
  return <CareerTemplate job={j} />;
}
