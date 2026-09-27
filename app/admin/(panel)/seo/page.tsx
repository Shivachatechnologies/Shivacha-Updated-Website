import { db } from "@/lib/db/client";
import { requirePermission } from "@/lib/auth/session";
import { deleteSeoEntryAction, saveSeoEntryAction, saveSettingAction } from "@/lib/admin/system-actions";
import { SETTING_DEFAULTS, type SeoSettings } from "@/lib/admin/settings";
import { Badge, EmptyState, PageHeader, Panel, TableWrap, fmtDate, inputCls, labelCls, td, th } from "@/components/admin/ui";
import { ConfirmButton, SubmitButton } from "@/components/admin/client";
import { ActionForm, FieldError } from "@/components/admin/forms";

export const metadata = { title: "SEO" };

function EntryFields({ e }: { e?: { path: string; title: string | null; description: string | null; canonical: string | null; ogImage: string | null; noindex: boolean } }) {
  const id = e?.path ?? "new";
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <label className={labelCls} htmlFor={`p-${id}`}>Path</label>
        <input id={`p-${id}`} name="path" defaultValue={e?.path} placeholder="/services/ai-agents" className={inputCls} />
        <FieldError name="path" />
      </div>
      <div>
        <label className={labelCls} htmlFor={`t-${id}`}>Title</label>
        <input id={`t-${id}`} name="title" defaultValue={e?.title ?? ""} maxLength={70} className={inputCls} />
        <FieldError name="title" />
      </div>
      <div className="sm:col-span-2">
        <label className={labelCls} htmlFor={`d-${id}`}>Meta description</label>
        <textarea id={`d-${id}`} name="description" rows={2} defaultValue={e?.description ?? ""} maxLength={300} className={`${inputCls} h-auto py-2`} />
        <FieldError name="description" />
      </div>
      <div>
        <label className={labelCls} htmlFor={`c-${id}`}>Canonical URL</label>
        <input id={`c-${id}`} name="canonical" defaultValue={e?.canonical ?? ""} placeholder="https://shivacha.com/…" className={inputCls} />
        <FieldError name="canonical" />
      </div>
      <div>
        <label className={labelCls} htmlFor={`o-${id}`}>Open Graph image</label>
        <input id={`o-${id}`} name="ogImage" defaultValue={e?.ogImage ?? ""} placeholder="/uploads/… or https://…" className={inputCls} />
        <FieldError name="ogImage" />
      </div>
      <label className="flex items-center gap-2 text-sm text-fg">
        <input type="checkbox" name="noindex" defaultChecked={e?.noindex} className="size-4" /> Hide from search engines (noindex)
      </label>
    </div>
  );
}

export default async function SeoPage() {
  await requirePermission("seo:manage");
  const [entries, setting] = await Promise.all([db.seoEntry.findMany({ orderBy: { path: "asc" } }), db.setting.findUnique({ where: { key: "seo" } })]);
  const s: SeoSettings = { ...SETTING_DEFAULTS.seo, ...((setting?.value as object) ?? {}) };
  return (
    <>
      <PageHeader title="SEO" description="Site-wide defaults, robots rules and per-URL overrides for titles, descriptions, canonicals, Open Graph images and indexing." crumbs={[{ label: "SEO" }]} />
      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Defaults & robots">
          <ActionForm action={saveSettingAction.bind(null, "seo")} className="space-y-3">
            <div>
              <label className={labelCls} htmlFor="sd">Default meta description</label>
              <textarea id="sd" name="defaultDescription" rows={2} maxLength={300} defaultValue={s.defaultDescription} className={`${inputCls} h-auto py-2`} placeholder="Used when a page has no description of its own" />
              <FieldError name="defaultDescription" />
            </div>
            <div>
              <label className={labelCls} htmlFor="so">Default Open Graph image</label>
              <input id="so" name="defaultOgImage" defaultValue={s.defaultOgImage} className={inputCls} placeholder="Leave empty to use the generated image" />
              <FieldError name="defaultOgImage" />
            </div>
            <label className="flex items-center gap-2 text-sm text-fg">
              <input type="checkbox" name="allowIndexing" defaultChecked={s.allowIndexing} className="size-4" /> Allow search engines to index the site
            </label>
            <div>
              <label className={labelCls} htmlFor="sx">Extra robots.txt disallow paths</label>
              <textarea id="sx" name="disallowPaths" rows={3} defaultValue={s.disallowPaths} className={`${inputCls} h-auto py-2 font-mono text-[13px]`} placeholder={"/private/\n/drafts/"} />
              <p className="mt-1 text-xs text-dim">One per line. /api/, /lp/ and /admin/ are always disallowed.</p>
              <FieldError name="disallowPaths" />
            </div>
            <SubmitButton>Save defaults</SubmitButton>
          </ActionForm>
        </Panel>
        <Panel title="Sitemap & robots">
          <ul className="space-y-2 text-sm">
            <li><a className="text-brand-blue hover:underline" href="/sitemap.xml" target="_blank" rel="noopener">/sitemap.xml</a> <span className="text-dim">— built from site routes plus published CMS content; noindex URLs are excluded.</span></li>
            <li><a className="text-brand-blue hover:underline" href="/robots.txt" target="_blank" rel="noopener">/robots.txt</a> <span className="text-dim">— reflects the settings on the left.</span></li>
          </ul>
          <p className="mt-4 text-xs text-dim">Changes apply immediately. CMS services, products, posts and pages also have their own SEO fields.</p>
        </Panel>
      </div>

      <h2 className="mt-8 mb-3 text-base font-semibold text-fg">Per-URL overrides</h2>
      <Panel title="Add override" className="mb-4">
        <ActionForm action={saveSeoEntryAction.bind(null, null)} resetOnOk className="space-y-3">
          <EntryFields />
          <SubmitButton>Add override</SubmitButton>
        </ActionForm>
      </Panel>
      {entries.length === 0 ? (
        <div className="rounded-lg border border-line bg-ink-900"><EmptyState title="No overrides yet" description="Every page uses the title and description defined in its template." /></div>
      ) : (
        <TableWrap>
          <thead>
            <tr><th className={th}>Path</th><th className={th}>Title</th><th className={th}>Indexing</th><th className={th}>Updated</th><th className={th}><span className="sr-only">Actions</span></th></tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className="align-top">
                <td className={`${td} font-mono text-[12.5px]`}>{e.path}</td>
                <td className={`${td} max-w-[280px] truncate text-muted`}>{e.title ?? "—"}</td>
                <td className={td}>{e.noindex ? <Badge tone="red">noindex</Badge> : <Badge tone="green">index</Badge>}</td>
                <td className={`${td} whitespace-nowrap text-muted`}>{fmtDate(e.updatedAt)}</td>
                <td className={`${td} w-[1%]`}>
                  <details className="group">
                    <summary className="btn-secondary h-8 cursor-pointer list-none px-2.5 text-xs">Edit</summary>
                    <div className="mt-3 w-[min(80vw,560px)] space-y-3 rounded-lg border border-line bg-ink-900 p-3">
                      <ActionForm action={saveSeoEntryAction.bind(null, e.id)} className="space-y-3">
                        <EntryFields e={e} />
                        <SubmitButton>Save</SubmitButton>
                      </ActionForm>
                      <form action={deleteSeoEntryAction.bind(null, e.id)}>
                        <ConfirmButton message={`Remove the SEO override for ${e.path}?`} confirmLabel="Remove" className="h-8 text-xs">Remove</ConfirmButton>
                      </form>
                    </div>
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
    </>
  );
}
