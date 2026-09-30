import { db } from "@/lib/db/client";
import { can } from "@/lib/auth/permissions";
import { requireAccess } from "@/lib/os/guard";
import { LANGUAGES, PLATFORM_LABELS, SOCIAL_PLATFORMS, type SocialPlatform } from "@/lib/growth/policy";
import { POST_FORMATS, type QaIssue } from "@/lib/growth/content";
import { SOCIAL_PROVIDERS } from "@/lib/growth/providers";
import { getGrowthSettings } from "@/lib/growth/settings";
import { markPublishedAction, publishNowAction, reviewPostAction, saveSocialMetricAction, saveSocialPostAction } from "@/lib/growth/actions";
import { enumOptions, KpiGrid, Kpi, NotConnected, SelectField, StatusBadge, Tabs, TextArea, TextField, str, type SP } from "@/components/admin/os";
import { Badge, EmptyState, PageHeader, Panel, fmtDate } from "@/components/admin/ui";
import { ActionForm } from "@/components/admin/forms";
import { SubmitButton } from "@/components/admin/client";
import { GROWTH_CRUMB, GrowthTabs } from "@/components/admin/growth/tabs";

export const metadata = { title: "Social media" };
export const dynamic = "force-dynamic";

const QUEUES = [
  ["PENDING_APPROVAL", "Needs approval"],
  ["SCHEDULED", "Scheduled"],
  ["APPROVED", "Approved"],
  ["PUBLISHED", "Published"],
  ["FAILED", "Failed"],
  ["REJECTED", "Rejected"],
] as const;

export default async function SocialPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireAccess("growth:view", "GROWTH");
  const manage = can(user.role, "growth:manage");
  const sp = await searchParams;
  const queue = (QUEUES.find(([k]) => k === str(sp, "q", 30))?.[0] ?? "PENDING_APPROVAL") as (typeof QUEUES)[number][0];
  const [s, posts, counts, metrics, campaigns] = await Promise.all([
    getGrowthSettings(),
    db.socialPost.findMany({ where: { status: queue }, orderBy: queue === "PUBLISHED" ? { publishedAt: "desc" } : { createdAt: "desc" }, take: 50 }),
    db.socialPost.groupBy({ by: ["status"], _count: { _all: true } }),
    db.socialMetric.findMany({ orderBy: { date: "desc" }, take: 200 }),
    db.campaign.findMany({ where: { status: { in: ["PLANNED", "ACTIVE"] } }, select: { id: true, name: true }, orderBy: { createdAt: "desc" }, take: 50 }),
  ]);
  const count = (k: string) => counts.find((c) => c.status === k)?._count._all ?? 0;
  const latest = (p: SocialPlatform) => metrics.find((x) => x.platform === p && x.followers != null);
  const connected = SOCIAL_PLATFORMS.filter((p) => SOCIAL_PROVIDERS[p].status().connected);
  return (
    <>
      <PageHeader title="Social media" description="LinkedIn, Instagram, Facebook, X and YouTube through their official APIs. Every post is reviewed by a person before it is published; follower numbers come only from the platforms or their own reports." crumbs={[GROWTH_CRUMB, { label: "Social" }]} />
      <GrowthTabs active="social" />
      <div className="mt-4">
        <KpiGrid cols={5}>
          {SOCIAL_PLATFORMS.map((p) => {
            const l = latest(p);
            return <Kpi key={p} label={PLATFORM_LABELS[p]} value={l?.followers != null ? l.followers.toLocaleString("en-US") : "—"} hint={l ? `${l.source === "API" ? "API" : "Entered"} · ${l.date.toISOString().slice(0, 10)}` : connected.includes(p) ? "Connected — syncs daily" : "Not connected"} />;
          })}
        </KpiGrid>
      </div>
      {!connected.length && (
        <div className="mt-4">
          <NotConnected name="Social platforms" env={["LINKEDIN_ACCESS_TOKEN", "META_PAGE_ACCESS_TOKEN", "X_ACCESS_TOKEN", "YOUTUBE_API_KEY"]}>Posts can be drafted, approved and marked as published by hand, but nothing is posted automatically until a platform is connected.</NotConnected>
        </div>
      )}
      {(s.stops.all || s.stops.social || s.stops.publishing) && <p className="mt-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">Publishing is stopped by a kill switch. Approvals still work; nothing will be posted.</p>}

      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="min-w-0">
          <Tabs active={queue} items={QUEUES.map(([k, l]) => ({ key: k, label: l, count: count(k), href: `/admin/marketing/social?q=${k}` }))} />
          <div className="mt-3 space-y-3">
            {posts.length ? (
              posts.map((p) => {
                const qa = (Array.isArray(p.qa) ? p.qa : []) as unknown as QaIssue[];
                return (
                  <article key={p.id} className="rounded-lg border border-line bg-ink-900 p-4">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <Badge tone="blue">{PLATFORM_LABELS[p.platform as SocialPlatform] ?? p.platform}</Badge>
                      <Badge>{p.format.toLowerCase()}</Badge>
                      <Badge>{LANGUAGES[p.language as keyof typeof LANGUAGES] ?? p.language}</Badge>
                      <StatusBadge value={p.status} />
                      {p.createdByAgent && <Badge tone="violet">AI draft · {p.createdByAgent}</Badge>}
                      <span className="text-dim">{fmtDate(p.createdAt, true)}</span>
                    </div>
                    <p className="mt-2 text-sm whitespace-pre-wrap text-fg">{p.body}</p>
                    {p.link && <p className="mt-1 truncate text-xs text-muted">🔗 {p.link}</p>}
                    {p.mediaUrl && <p className="mt-1 truncate text-xs text-muted">Media: {p.mediaUrl}</p>}
                    {qa.length > 0 && (
                      <ul className="mt-2 space-y-0.5 text-xs">
                        {qa.map((i, k) => (
                          <li key={k} className={i.level === "block" ? "text-red-700" : "text-amber-700"}>{i.level === "block" ? "Blocks publishing: " : "Check: "}{i.message}</li>
                        ))}
                      </ul>
                    )}
                    {p.error && <p className="mt-2 text-xs text-red-700">{p.error}</p>}
                    {p.scheduledAt && <p className="mt-1 text-xs text-muted">Scheduled for {fmtDate(p.scheduledAt, true)} UTC</p>}
                    {p.externalId && <p className="mt-1 text-xs text-muted">Platform ID: {p.externalId}</p>}
                    {manage && (
                      <div className="mt-3 flex flex-wrap items-end gap-2">
                        {["PENDING_APPROVAL", "FAILED", "APPROVED", "SCHEDULED"].includes(p.status) && (
                          <ActionForm action={reviewPostAction.bind(null, p.id, "approve")} className="flex flex-wrap items-end gap-2">
                            <TextField name="scheduledAt" type="datetime-local" label="Schedule (UTC, optional)" />
                            <SubmitButton>{p.status === "PENDING_APPROVAL" ? "Approve" : "Re-approve"}</SubmitButton>
                          </ActionForm>
                        )}
                        {["PENDING_APPROVAL", "FAILED", "APPROVED", "SCHEDULED"].includes(p.status) && (
                          <ActionForm action={reviewPostAction.bind(null, p.id, "reject")}>
                            <SubmitButton variant="secondary">Reject</SubmitButton>
                          </ActionForm>
                        )}
                        {["APPROVED", "SCHEDULED"].includes(p.status) && p.approvedById && (
                          <ActionForm action={publishNowAction.bind(null, p.id)}>
                            <SubmitButton variant="secondary">Publish now</SubmitButton>
                          </ActionForm>
                        )}
                        {["APPROVED", "SCHEDULED", "FAILED"].includes(p.status) && p.approvedById && (
                          <ActionForm action={markPublishedAction.bind(null, p.id)} className="flex flex-wrap items-end gap-2">
                            <TextField name="externalId" label="Published manually — post/video ID" />
                            <SubmitButton variant="secondary">Mark published</SubmitButton>
                          </ActionForm>
                        )}
                      </div>
                    )}
                  </article>
                );
              })
            ) : (
              <EmptyState title="Nothing here" description={queue === "PENDING_APPROVAL" ? "AI employees and your team add drafts here. Nothing is published without approval." : undefined} />
            )}
          </div>
        </div>
        {manage && (
          <div className="min-w-0 space-y-4">
            <Panel title="New post">
              <ActionForm action={saveSocialPostAction} className="space-y-3" resetOnOk>
                <div className="grid grid-cols-2 gap-2">
                  <SelectField name="platform" label="Platform" options={SOCIAL_PLATFORMS.map((p) => [p, PLATFORM_LABELS[p]] as const)} />
                  <SelectField name="language" label="Language" options={Object.entries(LANGUAGES)} />
                </div>
                <SelectField name="format" label="Format" options={enumOptions(POST_FORMATS)} />
                <TextArea name="body" label="Text" rows={6} required />
                <TextField name="link" label="Link (use the UTM builder on Demand gen)" placeholder="https://…" />
                <TextField name="mediaUrl" label="Image / video URL" placeholder="https://…" />
                <SelectField name="campaignId" label="Campaign" blank="None" options={campaigns.map((c) => [c.id, c.name] as const)} />
                <SubmitButton>Save for approval</SubmitButton>
              </ActionForm>
            </Panel>
            <Panel title="Enter platform figures">
              <ActionForm action={saveSocialMetricAction} className="space-y-3" resetOnOk>
                <p className="text-xs text-dim">Copy the numbers from the platform&apos;s own analytics for a day. Stored as “Entered”, separate from API data.</p>
                <div className="grid grid-cols-2 gap-2">
                  <SelectField name="platform" label="Platform" options={SOCIAL_PLATFORMS.map((p) => [p, PLATFORM_LABELS[p]] as const)} />
                  <TextField name="date" type="date" label="Date" required />
                  <TextField name="followers" type="number" label="Followers" />
                  <TextField name="reach" type="number" label="Reach" />
                  <TextField name="impressions" type="number" label="Impressions" />
                  <TextField name="engagements" type="number" label="Engagements" />
                  <TextField name="clicks" type="number" label="Clicks" />
                </div>
                <SubmitButton variant="secondary">Save figures</SubmitButton>
              </ActionForm>
            </Panel>
            <Panel title="Platform capabilities">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-dim"><th className="py-1 font-medium">Platform</th><th className="font-medium">Publishing</th><th className="font-medium">Followers</th></tr>
                </thead>
                <tbody>
                  {SOCIAL_PLATFORMS.map((p) => {
                    const on = connected.includes(p);
                    const pub = p === "YOUTUBE" ? "NOT_SUPPORTED" : on ? "CONNECTED" : "NOT_CONNECTED";
                    return (
                      <tr key={p} className="border-t border-line">
                        <td className="py-1.5">{PLATFORM_LABELS[p]}</td>
                        <td><StatusBadge value={pub} text={pub === "NOT_SUPPORTED" ? "Manual upload" : on ? (p === "INSTAGRAM" ? "Images only" : "API") : "Not connected"} /></td>
                        <td><StatusBadge value={on ? "CONNECTED" : "NOT_CONNECTED"} text={on ? "API" : "Not connected"} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-dim">Reach, impressions, engagement and clicks are not pulled from any API; enter them from each platform&apos;s own report. A post is marked published only after the platform returns its post ID.</p>
            </Panel>
            <Panel title="Growth rules">
              <ul className="list-disc space-y-1 pl-4 text-xs text-muted">
                <li>No bought followers, likes, views or comments; no bots, pods or follow/unfollow.</li>
                <li>No mass unsolicited DMs. Community replies are drafted for a person to send.</li>
                <li>Official platform APIs only — no scraping or platform workarounds.</li>
              </ul>
            </Panel>
          </div>
        )}
      </div>
    </>
  );
}
