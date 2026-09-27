"use server";

import { db } from "@/lib/db/client";
import { authorize } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import type { SearchHit } from "@/components/admin/client";

/** Global admin search. Every section is permission-checked on the server. */
export async function globalSearch(q: string): Promise<SearchHit[]> {
  const user = await authorize();
  const term = q.trim().slice(0, 80);
  if (term.length < 2) return [];
  const ci = { contains: term, mode: "insensitive" as const };
  const hits: SearchHit[] = [];
  const jobs: Promise<void>[] = [];
  if (can(user.role, "leads:view"))
    jobs.push(
      db.lead.findMany({ where: { archivedAt: null, OR: [{ name: ci }, { email: ci }, { company: ci }, { ref: ci }] }, take: 6, orderBy: { createdAt: "desc" }, select: { id: true, name: true, email: true, company: true } }).then((r) => {
        for (const l of r) hits.push({ type: "Lead", label: l.name, sub: [l.company, l.email].filter(Boolean).join(" · "), href: `/admin/leads/${l.id}` });
      }),
    );
  const content: [Parameters<typeof can>[1], string, string, () => Promise<{ id: string; title: string; slug: string }[]>][] = [
    ["services:manage", "Service", "services", () => db.service.findMany({ where: { OR: [{ name: ci }, { slug: ci }] }, take: 5, select: { id: true, name: true, slug: true } }).then((r) => r.map((x) => ({ id: x.id, title: x.name, slug: x.slug })))],
    ["products:manage", "Product", "products", () => db.product.findMany({ where: { OR: [{ name: ci }, { slug: ci }] }, take: 5, select: { id: true, name: true, slug: true } }).then((r) => r.map((x) => ({ id: x.id, title: x.name, slug: x.slug })))],
    ["pages:manage", "Page", "pages", () => db.page.findMany({ where: { OR: [{ title: ci }, { slug: ci }] }, take: 5, select: { id: true, title: true, slug: true } })],
    ["blog:manage", "Blog", "blog", () => db.blogPost.findMany({ where: { OR: [{ title: ci }, { slug: ci }] }, take: 5, select: { id: true, title: true, slug: true } })],
    ["caseStudies:manage", "Case study", "case-studies", () => db.caseStudy.findMany({ where: { OR: [{ title: ci }, { slug: ci }] }, take: 5, select: { id: true, title: true, slug: true } })],
  ];
  for (const [perm, type, path, run] of content) {
    if (!can(user.role, perm)) continue;
    jobs.push(
      run().then((r) => {
        for (const x of r) hits.push({ type, label: x.title, sub: `/${x.slug}`, href: `/admin/${path}/${x.id}` });
      }),
    );
  }
  await Promise.all(jobs);
  return hits.slice(0, 30);
}
