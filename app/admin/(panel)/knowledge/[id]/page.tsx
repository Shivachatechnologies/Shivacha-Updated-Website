import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db/client";
import { can } from "@/lib/auth/permissions";
import { requireAccess } from "@/lib/os/guard";
import { KB_CATEGORY_LABEL } from "@/lib/knowledge/constants";
import { PageHeader, Panel, fmtDate } from "@/components/admin/ui";
import { StatusBadge } from "@/components/admin/os";
import { KnowledgeForm } from "@/components/admin/knowledge-form";
import { Markdown } from "@/components/admin/ai/markdown";

export const metadata = { title: "Article" };

export default async function ArticlePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ edit?: string }> }) {
  const user = await requireAccess("knowledge:view");
  const { id } = await params;
  const a = await db.knowledgeArticle.findUnique({ where: { id }, include: { author: { select: { name: true } } } });
  const manage = can(user.role, "knowledge:manage");
  if (!a || (!manage && a.status !== "PUBLISHED")) notFound();
  const edit = manage && (await searchParams).edit === "1";
  const crumbs = [{ label: "Knowledge Base", href: "/admin/knowledge" }, { label: a.title }];
  if (edit)
    return (
      <>
        <PageHeader title={`Edit: ${a.title}`} crumbs={crumbs} actions={<Link href={`/admin/knowledge/${a.id}`} className="btn-secondary h-9 px-3 text-[13px]">Cancel</Link>} />
        <KnowledgeForm article={a} />
      </>
    );
  const publicUrl = a.visibility === "PUBLIC" && a.status === "PUBLISHED" ? `/help/${a.slug}` : null;
  return (
    <>
      <PageHeader title={a.title} description={a.excerpt ?? undefined} crumbs={crumbs} actions={<>{publicUrl && <Link href={publicUrl} target="_blank" className="btn-secondary h-9 px-3 text-[13px]">View public ↗</Link>}{manage && <Link href={`/admin/knowledge/${a.id}?edit=1`} className="btn-primary h-9 px-3.5 text-[13px]">Edit</Link>}</>} />
      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-muted">
        <StatusBadge value={a.status} /> <StatusBadge value={a.visibility} /> <span>{KB_CATEGORY_LABEL[a.category]}</span>
        {a.tags.map((t) => <span key={t} className="rounded bg-ink-850 px-1.5 py-0.5">#{t}</span>)}
        <span>· Updated {fmtDate(a.updatedAt, true)}{a.author ? ` by ${a.author.name}` : ""}</span>
      </div>
      <Panel><Markdown text={a.body} relativeLinks /></Panel>
    </>
  );
}
