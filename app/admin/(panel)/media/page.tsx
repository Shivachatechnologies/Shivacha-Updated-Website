import { FileText } from "lucide-react";
import { db } from "@/lib/db/client";
import { requirePermission } from "@/lib/auth/session";
import { storageMode } from "@/lib/storage";
import { deleteMediaAction, updateMediaAction, uploadMediaAction } from "@/lib/admin/media-actions";
import { EmptyState, PageHeader, Pagination, Panel, fmtDate, inputCls, labelCls } from "@/components/admin/ui";
import { ConfirmButton, SubmitButton } from "@/components/admin/client";
import { ActionForm } from "@/components/admin/forms";
import { CopyButton } from "@/components/admin/CopyButton";

export const metadata = { title: "Media" };
const PAGE = 24;

const size = (b: number) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

export default async function MediaPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string; type?: string }> }) {
  await requirePermission("media:manage");
  const sp = await searchParams;
  const q = sp.q?.trim().slice(0, 80) ?? "";
  const page = Math.max(1, Number(sp.page) || 1);
  const where = { ...(q && { OR: [{ filename: { contains: q, mode: "insensitive" as const } }, { alt: { contains: q, mode: "insensitive" as const } }] }), ...(sp.type === "image" && { mimeType: { startsWith: "image/" } }), ...(sp.type === "pdf" && { mimeType: "application/pdf" }) };
  const [total, items] = await Promise.all([db.media.count({ where }), db.media.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE, take: PAGE, include: { uploadedBy: { select: { name: true } } } })]);
  const mode = storageMode();

  return (
    <>
      <PageHeader title="Media library" description="Images and PDFs for CMS content. Files are validated by content; SVG and executable types are rejected." crumbs={[{ label: "Media" }]} />
      <Panel title="Upload" className="mb-5">
        {mode === "none" ? (
          <p className="text-sm text-amber-700">Object storage is not configured. Set <code className="font-mono">BLOB_READ_WRITE_TOKEN</code> (Vercel Blob) on the server to enable uploads.</p>
        ) : (
          <ActionForm action={uploadMediaAction} resetOnOk className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <label htmlFor="files" className={labelCls}>Files (JPG, PNG, WebP, AVIF, GIF, PDF · max 4 MB per upload)</label>
              <input id="files" name="files" type="file" multiple accept="image/jpeg,image/png,image/webp,image/avif,image/gif,application/pdf" className="block w-full text-sm text-muted file:mr-3 file:rounded-md file:border file:border-line-strong file:bg-ink-850 file:px-3 file:py-1.5 file:text-sm file:text-fg" />
            </div>
            <div className="sm:w-64">
              <label htmlFor="alt" className={labelCls}>Alt text</label>
              <input id="alt" name="alt" className={inputCls} placeholder="Describe the image" />
            </div>
            <SubmitButton>Upload</SubmitButton>
          </ActionForm>
        )}
        {mode === "local" && <p className="mt-2 text-xs text-dim">Development storage: files are saved to public/uploads. Configure BLOB_READ_WRITE_TOKEN for production.</p>}
      </Panel>
      <form method="get" role="search" className="mb-4 flex flex-wrap gap-2">
        <input name="q" defaultValue={q} placeholder="Search file name or alt text…" aria-label="Search media" className={`${inputCls} max-w-xs`} />
        <select name="type" defaultValue={sp.type ?? ""} aria-label="File type" className="h-9 rounded-md border border-line-strong bg-ink-900 px-2 text-[13px] text-fg">
          <option value="">All types</option>
          <option value="image">Images</option>
          <option value="pdf">PDFs</option>
        </select>
        <button className="btn-secondary h-9 px-3 text-[13px]">Search</button>
      </form>
      {items.length === 0 ? (
        <div className="rounded-lg border border-line bg-ink-900">
          <EmptyState title={q ? "No files match" : "No files uploaded yet"} />
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {items.map((m) => (
            <li key={m.id} className="overflow-hidden rounded-lg border border-line bg-ink-900">
              <div className="flex aspect-[4/3] items-center justify-center bg-ink-850">
                {m.mimeType.startsWith("image/") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.url} alt={m.alt ?? ""} loading="lazy" className="size-full object-contain" />
                ) : (
                  <FileText className="size-10 text-dim" aria-hidden />
                )}
              </div>
              <div className="space-y-2 p-3">
                <p className="truncate text-sm font-medium text-fg" title={m.filename}>{m.filename}</p>
                <p className="text-xs text-dim">
                  {size(m.size)}
                  {m.width ? ` · ${m.width}×${m.height}` : ""} · {fmtDate(m.createdAt)}
                  {m.uploadedBy ? ` · ${m.uploadedBy.name}` : ""}
                </p>
                <ActionForm action={updateMediaAction.bind(null, m.id)} className="space-y-2">
                  <input name="alt" defaultValue={m.alt ?? ""} placeholder="Alt text" aria-label={`Alt text for ${m.filename}`} className={inputCls} />
                  <input name="caption" defaultValue={m.caption ?? ""} placeholder="Caption" aria-label={`Caption for ${m.filename}`} className={inputCls} />
                  <div className="flex flex-wrap gap-2">
                    <SubmitButton variant="secondary" className="h-8 px-2.5 text-xs">Save</SubmitButton>
                    <CopyButton text={m.url} />
                  </div>
                </ActionForm>
                <form action={deleteMediaAction.bind(null, m.id)}>
                  <ConfirmButton message={`Delete ${m.filename}? Pages that use this URL will show a broken image.`} confirmLabel="Delete" className="h-8 px-2.5 text-xs">
                    Delete
                  </ConfirmButton>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Pagination page={page} pages={Math.max(1, Math.ceil(total / PAGE))} total={total} makeHref={(p) => `/admin/media?${new URLSearchParams({ ...(q && { q }), ...(sp.type && { type: sp.type }), page: String(p) })}`} />
    </>
  );
}
