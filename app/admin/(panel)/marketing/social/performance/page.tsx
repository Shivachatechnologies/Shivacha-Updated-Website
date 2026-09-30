import { db } from "@/lib/db/client";
import { can } from "@/lib/auth/permissions";
import { requireAccess } from "@/lib/os/guard";
import { PLATFORM_LABELS, SOCIAL_PLATFORMS, type SocialPlatform } from "@/lib/growth/policy";
import { engagementOf, getSocialStrategy, parseMetrics } from "@/lib/growth/social-metrics";
import { saveSocialStrategyAction, syncSocialMetricsAction } from "@/lib/company/actions";
import { DataTable, Kpi, KpiGrid, StatusBadge, TextArea, TextField } from "@/components/admin/os";
import { EmptyState, PageHeader, fmtDate } from "@/components/admin/ui";
import { ActionForm } from "@/components/admin/forms";
import { SubmitButton } from "@/components/admin/client";
import { GROWTH_CRUMB, GrowthTabs } from "@/components/admin/growth/tabs";
import { Card, Nature } from "@/components/admin/company/ui";

export const metadata = { title: "Social performance" };
export const dynamic = "force-dynamic";

const dash = (v: number | null | undefined) => (v == null ? "—" : v.toLocaleString("en-US"));

export default async function SocialPerformancePage() {
  const user = await requireAccess("growth:view", "GROWTH");
  const manage = can(user.role, "growth:manage");
  const now = new Date();
  const since = new Date(now.getTime() - 30 * 86400_000);
  const week = new Date(now.getTime() + 7 * 86400_000);
  const [posts, strategy, planned] = await Promise.all([
    db.socialPost.findMany({ where: { status: "PUBLISHED", publishedAt: { gte: since } }, orderBy: { publishedAt: "desc" }, take: 200, select: { id: true, platform: true, body: true, publishedAt: true, externalId: true, metrics: true, metricsAt: true } }),
    getSocialStrategy(),
    db.socialPost.groupBy({ by: ["platform"], where: { status: { in: ["SCHEDULED", "APPROVED"] }, scheduledAt: { gte: now, lt: week } }, _count: { _all: true } }),
  ]);
  const rows = posts.map((p) => ({ ...p, m: parseMetrics(p.metrics) })).map((p) => ({ ...p, eng: engagementOf(p.m) }));
  const synced = rows.filter((r) => r.m);
  const top = [...synced].sort((a, b) => (b.eng ?? 0) - (a.eng ?? 0)).slice(0, 10);
  return (
    <>
      <PageHeader title="Social performance & strategy" description="Post-level results come from each platform's API for posts published with a platform ID; metrics a platform does not expose stay “—” (UNAVAILABLE). The strategy below guides the AI Social Media Manager's drafts." crumbs={[GROWTH_CRUMB, { label: "Social", href: "/admin/marketing/social" }, { label: "Performance" }]} actions={manage ? <ActionForm action={syncSocialMetricsAction}><SubmitButton variant="secondary">Sync metrics now</SubmitButton></ActionForm> : undefined} />
      <GrowthTabs active="social" />
      <div className="mt-4">
        <KpiGrid cols={4}>
          <Kpi label="Published (30 days)" value={rows.length} />
          <Kpi label="With platform metrics" value={synced.length} hint={`${rows.length - synced.length} not synced`} />
          <Kpi label="Engagement (synced posts)" value={<span className="flex items-center gap-1.5">{synced.reduce((a, r) => a + (r.eng ?? 0), 0).toLocaleString("en-US")} <Nature value={synced.length ? "REAL" : "UNAVAILABLE"} /></span>} hint="likes + comments + shares + clicks" />
          <Kpi label="Scheduled next 7 days" value={planned.reduce((a, p) => a + p._count._all, 0)} />
        </KpiGrid>
      </div>
      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        <div className="min-w-0 space-y-4">
          <Card title="By platform (30 days)">
            <DataTable
              rows={SOCIAL_PLATFORMS.map((p) => {
                const list = synced.filter((r) => r.platform === p);
                const sum = (k: "impressions" | "reach" | "views" | "likes" | "comments" | "shares") => (list.some((r) => r.m![k] != null) ? list.reduce((a, r) => a + (r.m![k] ?? 0), 0) : null);
                return { id: p, published: rows.filter((r) => r.platform === p).length, impressions: sum("impressions"), reach: sum("reach"), views: sum("views"), likes: sum("likes"), comments: sum("comments"), shares: sum("shares"), planned: planned.find((x) => x.platform === p)?._count._all ?? 0, target: strategy.cadence[p] ?? null };
              })}
              columns={[
                { header: "Platform", cell: (r) => PLATFORM_LABELS[r.id as SocialPlatform] },
                { header: "Published", cell: (r) => r.published },
                { header: "Impressions", cell: (r) => dash(r.impressions) },
                { header: "Reach / views", cell: (r) => dash(r.reach ?? r.views) },
                { header: "Likes", cell: (r) => dash(r.likes) },
                { header: "Comments", cell: (r) => dash(r.comments) },
                { header: "Shares", cell: (r) => dash(r.shares) },
                { header: "Next 7 days vs plan", cell: (r) => (r.target != null ? `${r.planned} / ${r.target}` : `${r.planned}`) },
              ]}
            />
          </Card>
          <Card title="Top posts by engagement">
            {top.length ? (
              <DataTable rows={top} columns={[{ header: "Post", cell: (r) => <span className="line-clamp-2 max-w-md text-sm">{r.body}</span> }, { header: "Platform", cell: (r) => PLATFORM_LABELS[r.platform as SocialPlatform] ?? r.platform }, { header: "Published", cell: (r) => <span className="text-xs">{fmtDate(r.publishedAt!, true)}</span> }, { header: "Engagement", cell: (r) => dash(r.eng) }, { header: "Synced", cell: (r) => <span className="text-xs">{fmtDate(r.metricsAt!, true)}</span> }]} />
            ) : (
              <EmptyState title="No platform metrics yet" description="Metrics appear after posts are published through a connected platform and synced." />
            )}
          </Card>
        </div>
        <Card title="Strategy">
          {manage ? (
            <ActionForm action={saveSocialStrategyAction} className="space-y-2.5">
              <TextArea name="pillars" label="Content pillars (one per line)" rows={4} defaultValue={strategy.pillars.join("\n")} />
              <TextField name="audience" label="Audience" defaultValue={strategy.audience} />
              <TextField name="tone" label="Tone of voice" defaultValue={strategy.tone} />
              <fieldset className="grid grid-cols-2 gap-2">
                <legend className="mb-1 text-[12.5px] font-medium">Posts per week</legend>
                {SOCIAL_PLATFORMS.map((p) => <TextField key={p} name={`cad_${p}`} type="number" label={PLATFORM_LABELS[p]} defaultValue={strategy.cadence[p] ?? ""} />)}
              </fieldset>
              <SubmitButton>Save strategy</SubmitButton>
            </ActionForm>
          ) : (
            <p className="text-sm text-muted">{strategy.pillars.join(" · ") || "No strategy set."}</p>
          )}
          <p className="mt-2 text-xs text-dim">Every post still needs a person&apos;s approval; publishing happens only with platform confirmation and while no kill switch is on. <StatusBadge value="MANUAL" text="YouTube: manual upload" /></p>
        </Card>
      </div>
    </>
  );
}
