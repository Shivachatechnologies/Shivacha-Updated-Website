import { db } from "@/lib/db/client";
import { can } from "@/lib/auth/permissions";
import { requireAccess } from "@/lib/os/guard";
import { ASSET_KINDS, repurposePlan } from "@/lib/growth/content";
import { LANGUAGES, PLATFORM_LABELS } from "@/lib/growth/policy";
import { repurposeAssetAction, reviewAssetAction, saveContentAssetAction } from "@/lib/growth/actions";
import { enumOptions, SelectField, StatusBadge, Tabs, TextArea, TextField, str, type SP } from "@/components/admin/os";
import { Badge, EmptyState, PageHeader, Panel, fmtDate, label } from "@/components/admin/ui";
import { ActionForm } from "@/components/admin/forms";
import { SubmitButton } from "@/components/admin/client";
import { GROWTH_CRUMB, GrowthTabs } from "@/components/admin/growth/tabs";

export const metadata = { title: "Content studio" };
export const dynamic = "force-dynamic";

const STATUSES = ["IN_REVIEW", "APPROVED", "PUBLISHED", "ARCHIVED"] as const;

export default async function ContentPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireAccess("growth:view", "GROWTH");
  const manage = can(user.role, "growth:manage");
  const sp = await searchParams;
  const status = (STATUSES.find((s) => s === str(sp, "s", 20)) ?? "IN_REVIEW") as (typeof STATUSES)[number];
  const [assets, counts] = await Promise.all([
    db.contentAsset.findMany({ where: { status }, orderBy: { createdAt: "desc" }, take: 40, include: { _count: { select: { posts: true } } } }),
    db.contentAsset.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  return (
    <>
      <PageHeader title="Content studio" description="Articles, video and reel scripts, image briefs and newsletters — drafted by your team or AI employees, reviewed by a person, then repurposed into platform posts that each need their own approval." crumbs={[GROWTH_CRUMB, { label: "Content" }]} />
      <GrowthTabs active="content" />
      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="min-w-0">
          <Tabs active={status} items={STATUSES.map((s) => ({ key: s, label: label(s), count: counts.find((c) => c.status === s)?._count._all ?? 0, href: `/admin/marketing/content?s=${s}` }))} />
          <div className="mt-3 space-y-3">
            {assets.length ? (
              assets.map((a) => (
                <article key={a.id} className="rounded-lg border border-line bg-ink-900 p-4">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <Badge tone="blue">{label(a.kind)}</Badge>
                    <Badge>{LANGUAGES[a.language as keyof typeof LANGUAGES] ?? a.language}</Badge>
                    <StatusBadge value={a.status} />
                    {a.createdByAgent && <Badge tone="violet">AI draft · {a.createdByAgent}</Badge>}
                    <span className="text-dim">{fmtDate(a.createdAt, true)} · {a._count.posts} post(s)</span>
                  </div>
                  <h3 className="mt-2 font-semibold text-fg">{a.title}</h3>
                  <details className="mt-1">
                    <summary className="cursor-pointer text-xs text-muted">Show content</summary>
                    <p className="mt-2 text-sm whitespace-pre-wrap text-fg">{a.body}</p>
                  </details>
                  {manage && (
                    <div className="mt-3 flex flex-wrap items-end gap-2">
                      {a.status === "IN_REVIEW" && (
                        <ActionForm action={reviewAssetAction.bind(null, a.id, "APPROVED")}>
                          <SubmitButton>Approve</SubmitButton>
                        </ActionForm>
                      )}
                      {a.status !== "ARCHIVED" && (
                        <ActionForm action={reviewAssetAction.bind(null, a.id, "ARCHIVED")}>
                          <SubmitButton variant="secondary">Archive</SubmitButton>
                        </ActionForm>
                      )}
                      {(a.status === "APPROVED" || a.status === "PUBLISHED") && (
                        <ActionForm action={repurposeAssetAction.bind(null, a.id)} className="flex flex-wrap items-end gap-2">
                          <TextField name="path" label="Link to site path" placeholder="/services/…" />
                          <TextField name="campaign" label="UTM campaign" placeholder="q4-fintech" />
                          <SubmitButton variant="secondary">Repurpose → {repurposePlan(a.kind as (typeof ASSET_KINDS)[number]).map((x) => PLATFORM_LABELS[x.platform]).join(", ")}</SubmitButton>
                        </ActionForm>
                      )}
                    </div>
                  )}
                </article>
              ))
            ) : (
              <EmptyState title="No content here" description="Content drafted by the AI Marketing employee or your team appears here for review." />
            )}
          </div>
        </div>
        {manage && (
          <Panel title="New content">
            <ActionForm action={saveContentAssetAction} className="space-y-3" resetOnOk>
              <div className="grid grid-cols-2 gap-2">
                <SelectField name="kind" label="Type" options={enumOptions(ASSET_KINDS)} />
                <SelectField name="language" label="Language" options={Object.entries(LANGUAGES)} />
              </div>
              <TextField name="title" label="Title" required />
              <TextArea name="body" label="Content / script / brief" rows={10} required />
              <TextField name="mediaUrl" label="Image / video URL (optional)" />
              <SubmitButton>Save for review</SubmitButton>
            </ActionForm>
          </Panel>
        )}
      </div>
    </>
  );
}
