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
  // Operating-system records (each section is permission-checked).
  const os: [Parameters<typeof can>[1], () => Promise<SearchHit[]>][] = [
    ["deals:view", () => db.deal.findMany({ where: { deletedAt: null, OR: [{ name: ci }, { number: ci }, { company: ci }] }, take: 5, orderBy: { updatedAt: "desc" }, select: { id: true, number: true, name: true, stage: true } }).then((r) => r.map((d) => ({ type: "Deal", label: `${d.number} · ${d.name}`, sub: d.stage.toLowerCase(), href: `/admin/deals/${d.id}` })))],
    ["clients:view", () => db.client.findMany({ where: { deletedAt: null, OR: [{ name: ci }, { number: ci }, { legalName: ci }, { billingEmail: ci }] }, take: 5, select: { id: true, number: true, name: true, country: true } }).then((r) => r.map((c) => ({ type: "Client", label: c.name, sub: [c.number, c.country].filter(Boolean).join(" · "), href: `/admin/clients/${c.id}` })))],
    ["clients:view", () => db.clientContact.findMany({ where: { OR: [{ name: ci }, { email: ci }], client: { deletedAt: null } }, take: 5, select: { name: true, email: true, clientId: true, client: { select: { name: true } } } }).then((r) => r.map((c) => ({ type: "Contact", label: c.name, sub: [c.email, c.client.name].filter(Boolean).join(" · "), href: `/admin/clients/${c.clientId}` })))],
    ["proposals:view", () => db.proposal.findMany({ where: { deletedAt: null, OR: [{ title: ci }, { number: ci }] }, take: 5, select: { id: true, number: true, title: true, status: true } }).then((r) => r.map((p) => ({ type: "Proposal", label: `${p.number} · ${p.title}`, sub: p.status.toLowerCase(), href: `/admin/proposals/${p.id}` })))],
    ["contracts:view", () => db.contract.findMany({ where: { deletedAt: null, OR: [{ title: ci }, { number: ci }] }, take: 5, select: { id: true, number: true, title: true, status: true } }).then((r) => r.map((c) => ({ type: "Contract", label: `${c.number} · ${c.title}`, sub: c.status.toLowerCase(), href: `/admin/contracts/${c.id}` })))],
    ["finance:view", () => db.invoice.findMany({ where: { OR: [{ number: ci }, { client: { name: ci } }] }, take: 5, orderBy: { createdAt: "desc" }, select: { id: true, number: true, status: true, client: { select: { name: true } } } }).then((r) => r.map((i) => ({ type: "Invoice", label: i.number, sub: `${i.client.name} · ${i.status.toLowerCase().replace(/_/g, " ")}`, href: `/admin/finance/invoices/${i.id}` })))],
    ["projects:view", () => db.project.findMany({ where: { deletedAt: null, OR: [{ name: ci }, { number: ci }] }, take: 5, select: { id: true, number: true, name: true, status: true } }).then((r) => r.map((p) => ({ type: "Project", label: `${p.number} · ${p.name}`, sub: p.status.toLowerCase(), href: `/admin/projects/${p.id}` })))],
    ["support:view", () => db.ticket.findMany({ where: { OR: [{ subject: ci }, { number: ci }, { contactEmail: ci }] }, take: 5, orderBy: { createdAt: "desc" }, select: { id: true, number: true, subject: true, status: true } }).then((r) => r.map((t) => ({ type: "Ticket", label: `${t.number} · ${t.subject}`, sub: t.status.toLowerCase().replace(/_/g, " "), href: `/admin/support/${t.id}` })))],
    ["knowledge:view", () => db.knowledgeArticle.findMany({ where: { status: can(user.role, "knowledge:manage") ? undefined : "PUBLISHED", OR: [{ title: ci }, { excerpt: ci }] }, take: 5, select: { id: true, title: true, category: true } }).then((r) => r.map((a) => ({ type: "Article", label: a.title, sub: a.category.toLowerCase(), href: `/admin/knowledge/${a.id}` })))],
  ];
  for (const [perm, run] of os)
    if (can(user.role, perm))
      jobs.push(
        run().then((r) => {
          hits.push(...r);
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
  return hits.slice(0, 40);
}
