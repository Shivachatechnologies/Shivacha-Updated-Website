import Link from "next/link";
import { db } from "@/lib/db/client";
import type { Prisma } from "@/lib/generated/prisma/client";
import { can } from "@/lib/auth/permissions";
import { requireAccess } from "@/lib/os/guard";
import { KB_CATEGORIES, KB_CATEGORY_LABEL } from "@/lib/knowledge/constants";
import { fmtDate } from "@/components/admin/ui";
import { ListView, LinkCell, PAGE_SIZE, StatusBadge, pageOf, pick, str, type SP } from "@/components/admin/os";

export const metadata = { title: "Knowledge Base" };
const VIS = ["INTERNAL", "CLIENT", "PUBLIC"] as const;
const STATUS = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;

export default async function KnowledgePage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireAccess("knowledge:view");
  const sp = await searchParams;
  const manage = can(user.role, "knowledge:manage");
  const values = { q: str(sp, "q", 80), category: pick(sp, "category", KB_CATEGORIES), visibility: pick(sp, "visibility", VIS), status: manage ? pick(sp, "status", STATUS) : undefined, page: str(sp, "page") };
  const page = pageOf(sp);
  const ci = values.q ? { contains: values.q, mode: "insensitive" as const } : undefined;
  // Readers only see published articles; editors see drafts and archive too.
  const where: Prisma.KnowledgeArticleWhereInput = { status: manage ? values.status : "PUBLISHED", category: values.category, visibility: values.visibility, ...(ci && { OR: [{ title: ci }, { excerpt: ci }, { body: ci }, { tags: { has: values.q.toLowerCase() } }] }) };
  const [rows, total] = await Promise.all([db.knowledgeArticle.findMany({ where, orderBy: { updatedAt: "desc" }, take: PAGE_SIZE, skip: (page - 1) * PAGE_SIZE, include: { author: { select: { name: true } } } }), db.knowledgeArticle.count({ where })]);
  return (
    <ListView
      title="Knowledge Base"
      description="Internal playbooks, client help and public help-centre articles. The AI Knowledge and Support agents answer from published articles and respect visibility."
      crumbs={[{ label: "Support" }, { label: "Knowledge Base" }]}
      actions={<>{<Link href="/help" className="btn-secondary h-9 px-3 text-[13px]" target="_blank">Public help centre ↗</Link>}{manage && <Link href="/admin/knowledge/new" className="btn-primary h-9 px-3.5 text-[13px]">New article</Link>}</>}
      basePath="/admin/knowledge"
      values={values}
      rows={rows}
      total={total}
      page={page}
      filters={[
        { type: "search", name: "q", placeholder: "Search articles…" },
        { type: "select", name: "category", label: "Any category", options: KB_CATEGORIES.map((c) => [c, KB_CATEGORY_LABEL[c]] as const) },
        { type: "select", name: "visibility", label: "Any visibility", options: VIS.map((v) => [v, v.charAt(0) + v.slice(1).toLowerCase()] as const) },
        ...(manage ? [{ type: "select" as const, name: "status", label: "Any status", options: STATUS.map((v) => [v, v.charAt(0) + v.slice(1).toLowerCase()] as const) }] : []),
      ]}
      empty={{ title: "No articles yet", description: manage ? "Write the first article — internal playbooks, client guides or public help." : "Published articles will appear here.", action: manage ? <Link href="/admin/knowledge/new" className="btn-primary h-9 px-3.5 text-[13px]">New article</Link> : undefined }}
      columns={[
        { header: "Article", cell: (a) => <LinkCell href={`/admin/knowledge/${a.id}`} sub={a.excerpt ?? undefined}>{a.title}</LinkCell> },
        { header: "Category", cell: (a) => <span className="text-muted">{KB_CATEGORY_LABEL[a.category]}</span> },
        { header: "Visibility", cell: (a) => <StatusBadge value={a.visibility} /> },
        { header: "Status", cell: (a) => <StatusBadge value={a.status} /> },
        { header: "Updated", cell: (a) => <span className="text-muted">{fmtDate(a.updatedAt)}{a.author ? ` · ${a.author.name}` : ""}</span> },
      ]}
    />
  );
}
