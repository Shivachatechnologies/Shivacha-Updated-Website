import { notFound } from "next/navigation";
import { db } from "@/lib/db/client";
import { requirePermission } from "@/lib/auth/session";
import { toInsight } from "@/lib/cms/mappers";
import { InsightTemplate } from "@/components/templates/ContentTemplates";
import { CmsPage } from "@/components/templates/CmsPage";
import { SiteChrome } from "@/components/layout/SiteChrome";

export const dynamic = "force-dynamic";
export const metadata = { title: "Preview", robots: { index: false, follow: false } };

/** Draft preview of a blog post or CMS page, rendered with the public templates. Admin-only. */
export default async function Preview({ params }: { params: Promise<{ type: string; id: string }> }) {
  const { type, id } = await params;
  let body: React.ReactNode;
  if (type === "blog") {
    await requirePermission("blog:manage");
    const post = await db.blogPost.findUnique({ where: { id } });
    if (!post) notFound();
    body = <InsightTemplate insight={toInsight(post)} />;
  } else if (type === "pages") {
    await requirePermission("pages:manage");
    const page = await db.page.findUnique({ where: { id }, include: { sections: { where: { hidden: false }, orderBy: { order: "asc" } } } });
    if (!page) notFound();
    body = <CmsPage page={page} />;
  } else notFound();
  return (
    <div data-theme="light">
      <div className="fixed inset-x-0 bottom-0 z-[90] bg-amber-400 px-4 py-2 text-center text-sm font-medium text-black">Preview — this is how the content will look when published.</div>
      <SiteChrome>{body}</SiteChrome>
    </div>
  );
}
