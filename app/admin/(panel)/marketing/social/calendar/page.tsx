import Link from "next/link";
import { db } from "@/lib/db/client";
import { requireAccess } from "@/lib/os/guard";
import { PLATFORM_LABELS, type SocialPlatform } from "@/lib/growth/policy";
import { StatusBadge, str, type SP } from "@/components/admin/os";
import { PageHeader } from "@/components/admin/ui";
import { GROWTH_CRUMB, GrowthTabs } from "@/components/admin/growth/tabs";
import { cn } from "@/lib/cn";

export const metadata = { title: "Social calendar" };
export const dynamic = "force-dynamic";

const DAY = 86400_000;
const startOfWeek = (d: Date) => {
  const u = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  return new Date(u.getTime() - ((u.getUTCDay() + 6) % 7) * DAY);
};

export default async function SocialCalendarPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAccess("growth:view", "GROWTH");
  const sp = await searchParams;
  const offset = Math.max(-26, Math.min(26, Number(str(sp, "w", 4)) || 0));
  const from = new Date(startOfWeek(new Date()).getTime() + offset * 7 * DAY);
  const to = new Date(from.getTime() + 35 * DAY);
  const [posts, unscheduled] = await Promise.all([
    db.socialPost.findMany({ where: { OR: [{ scheduledAt: { gte: from, lt: to } }, { publishedAt: { gte: from, lt: to } }] }, orderBy: [{ scheduledAt: "asc" }, { publishedAt: "asc" }], select: { id: true, platform: true, status: true, body: true, scheduledAt: true, publishedAt: true, externalId: true } }),
    db.socialPost.count({ where: { status: { in: ["APPROVED", "PENDING_APPROVAL"] }, scheduledAt: null } }),
  ]);
  const days = Array.from({ length: 35 }, (_, i) => new Date(from.getTime() + i * DAY));
  const key = (d: Date) => d.toISOString().slice(0, 10);
  const today = key(new Date());
  return (
    <>
      <PageHeader title="Social calendar" description="Scheduled and published posts by day (UTC). A post shows as published only when the platform returned its post ID; scheduled posts publish only after a person approved them and while no kill switch is on." crumbs={[GROWTH_CRUMB, { label: "Social", href: "/admin/marketing/social" }, { label: "Calendar" }]} />
      <GrowthTabs active="social" />
      <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
        <Link href={`/admin/marketing/social/calendar?w=${offset - 5}`} className="btn-secondary h-8 px-3 text-xs">← Earlier</Link>
        <Link href="/admin/marketing/social/calendar" className="btn-secondary h-8 px-3 text-xs">This week</Link>
        <Link href={`/admin/marketing/social/calendar?w=${offset + 5}`} className="btn-secondary h-8 px-3 text-xs">Later →</Link>
        <span className="text-dim">{key(from)} → {key(new Date(to.getTime() - DAY))}</span>
        {unscheduled > 0 && <Link href="/admin/marketing/social?q=APPROVED" className="text-brand-blue hover:underline">{unscheduled} post(s) not scheduled yet</Link>}
      </div>
      <div className="mt-3 overflow-x-auto">
        <div className="grid min-w-[760px] grid-cols-7 gap-1.5">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <p key={d} className="px-1 text-[11px] font-medium text-dim uppercase">{d}</p>)}
          {days.map((d) => {
            const items = posts.filter((p) => key(p.publishedAt ?? p.scheduledAt!) === key(d));
            return (
              <div key={key(d)} className={cn("min-h-28 rounded-md border border-line bg-ink-900 p-1.5", key(d) === today && "border-brand-blue/50")}>
                <p className="text-[11px] text-dim">{d.getUTCDate()}</p>
                <ul className="mt-1 space-y-1">
                  {items.map((p) => (
                    <li key={p.id} className="rounded bg-ink-850 px-1.5 py-1 text-[11px]">
                      <p className="flex items-center justify-between gap-1"><span className="font-medium">{PLATFORM_LABELS[p.platform as SocialPlatform] ?? p.platform}</span><StatusBadge value={p.status} /></p>
                      <p className="line-clamp-2 text-muted">{p.body}</p>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
