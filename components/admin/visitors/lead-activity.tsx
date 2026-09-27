import Link from "next/link";
import { db } from "@/lib/db/client";
import { Panel, fmtDate, label } from "@/components/admin/ui";
import { IntentBadge, CompanyCell, place } from "./ui";

/** Website activity for a CRM lead: the first-party visitor record(s) linked when they submitted a form. */
export async function LeadWebsiteActivity({ leadId }: { leadId: string }) {
  const visitors = await db.visitor.findMany({ where: { leadId }, orderBy: { lastSeenAt: "desc" }, take: 3, include: { company: { select: { name: true, domain: true } } } });
  if (!visitors.length) return null;
  const events = await db.visitorEvent.findMany({ where: { visitorId: { in: visitors.map((v) => v.id) }, type: { not: "page_leave" } }, orderBy: { at: "desc" }, take: 15, select: { id: true, type: true, path: true, label: true, at: true } });
  const v = visitors[0];
  return (
    <Panel title="Website activity" action={<Link href={`/admin/visitors/${v.id}`} className="text-xs text-brand-blue">Full journey</Link>}>
      <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
        <IntentBadge label={v.intentLabel} score={v.intentScore} />
        <span className="text-muted">{v.sessionsCount} visit(s) · {v.pageViews} page(s) · {place(v)}</span>
        <span className="text-muted">First: {v.firstSource ?? "direct"} / {v.firstMedium ?? "none"}</span>
        <CompanyCell company={v.company} />
      </div>
      <ul className="space-y-1 text-sm">
        {events.map((e) => (
          <li key={e.id} className="flex gap-3">
            <span className="w-32 shrink-0 text-dim">{fmtDate(e.at, true)}</span>
            <span>{label(e.type)}</span>
            <span className="truncate text-muted">{e.path}{e.label ? ` · ${e.label}` : ""}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
