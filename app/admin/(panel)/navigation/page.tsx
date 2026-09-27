import { ArrowDown, ArrowUp } from "lucide-react";
import { db } from "@/lib/db/client";
import { requirePermission } from "@/lib/auth/session";
import { deleteNavItemAction, importFooterNavAction, moveNavItemAction, saveNavItemAction } from "@/lib/admin/system-actions";
import { Badge, EmptyState, PageHeader, Panel, inputCls, labelCls } from "@/components/admin/ui";
import { ConfirmButton, SubmitButton } from "@/components/admin/client";
import { ActionForm, FieldError } from "@/components/admin/forms";

export const metadata = { title: "Navigation" };

type Item = { id: string; label: string; url: string; order: number; active: boolean; parentId: string | null };

function Fields({ item, parents }: { item?: Item; parents: Item[] }) {
  const id = item?.id ?? "new";
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_90px_auto] lg:items-end">
      <input type="hidden" name="menu" value="FOOTER" />
      <div>
        <label className={labelCls} htmlFor={`l-${id}`}>Label</label>
        <input id={`l-${id}`} name="label" defaultValue={item?.label} className={inputCls} />
        <FieldError name="label" />
      </div>
      <div>
        <label className={labelCls} htmlFor={`u-${id}`}>Link</label>
        <input id={`u-${id}`} name="url" defaultValue={item?.url ?? ""} placeholder="/services or https://… (# for a column)" className={inputCls} />
        <FieldError name="url" />
      </div>
      <div>
        <label className={labelCls} htmlFor={`p-${id}`}>Column</label>
        <select id={`p-${id}`} name="parentId" defaultValue={item?.parentId ?? ""} className={inputCls}>
          <option value="">— New column (top level) —</option>
          {parents.filter((p) => p.id !== item?.id).map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
        <FieldError name="parentId" />
      </div>
      <div>
        <label className={labelCls} htmlFor={`o-${id}`}>Order</label>
        <input id={`o-${id}`} name="order" type="number" min={0} defaultValue={item?.order ?? 99} className={inputCls} />
      </div>
      <label className="flex h-9 items-center gap-2 text-sm text-fg">
        <input type="checkbox" name="active" defaultChecked={item?.active ?? true} className="size-4" /> Visible
      </label>
    </div>
  );
}

function Row({ item, parents, depth }: { item: Item; parents: Item[]; depth: number }) {
  return (
    <div className={depth ? "border-t border-line py-2 pl-4 sm:pl-6" : "py-2"}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 text-sm">
          <span className={depth ? "text-fg" : "font-semibold text-fg"}>{item.label}</span> {depth > 0 && <span className="font-mono text-xs text-dim">{item.url}</span>} {!item.active && <Badge>Hidden</Badge>}
        </p>
        <div className="flex items-center gap-1">
          <form action={moveNavItemAction.bind(null, item.id, -1)}>
            <button className="flex size-8 items-center justify-center rounded-md border border-line text-muted hover:text-fg" aria-label={`Move ${item.label} up`}><ArrowUp className="size-3.5" /></button>
          </form>
          <form action={moveNavItemAction.bind(null, item.id, 1)}>
            <button className="flex size-8 items-center justify-center rounded-md border border-line text-muted hover:text-fg" aria-label={`Move ${item.label} down`}><ArrowDown className="size-3.5" /></button>
          </form>
          <details className="relative">
            <summary className="btn-secondary h-8 cursor-pointer list-none px-2.5 text-xs">Edit</summary>
            <div className="absolute right-0 z-20 mt-2 w-[min(88vw,760px)] space-y-3 rounded-lg border border-line bg-ink-900 p-3 shadow-xl">
              <ActionForm action={saveNavItemAction.bind(null, item.id)} className="space-y-3">
                <Fields item={item} parents={parents} />
                <SubmitButton>Save</SubmitButton>
              </ActionForm>
              <form action={deleteNavItemAction.bind(null, item.id)}>
                <ConfirmButton message={depth ? `Delete “${item.label}”?` : `Delete the “${item.label}” column and all its links?`} confirmLabel="Delete" className="h-8 text-xs">Delete</ConfirmButton>
              </form>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}

export default async function NavigationPage() {
  await requirePermission("navigation:manage");
  const all = await db.navigationItem.findMany({ where: { menu: "FOOTER" }, orderBy: [{ order: "asc" }, { createdAt: "asc" }] });
  const cols = all.filter((i) => !i.parentId);
  return (
    <>
      <PageHeader title="Navigation" description="Footer menu columns and links. The header mega-menu is part of the site design and stays code-managed (data/navigation.ts)." crumbs={[{ label: "Navigation" }]} />
      {all.length === 0 ? (
        <Panel className="mb-5">
          <EmptyState
            title="The footer uses its built-in menu"
            description="Import the current footer to start editing it here. Once the CMS has footer items, the website uses them instead."
            action={
              <form action={importFooterNavAction}>
                <SubmitButton>Import current footer</SubmitButton>
              </form>
            }
          />
        </Panel>
      ) : (
        <div className="mb-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {cols.map((c) => (
            <Panel key={c.id}>
              <Row item={c} parents={cols} depth={0} />
              {all.filter((i) => i.parentId === c.id).map((l) => (
                <Row key={l.id} item={l} parents={cols} depth={1} />
              ))}
            </Panel>
          ))}
        </div>
      )}
      <Panel title="Add column or link">
        <ActionForm action={saveNavItemAction.bind(null, null)} resetOnOk className="space-y-3">
          <Fields parents={cols} />
          <SubmitButton>Add</SubmitButton>
        </ActionForm>
      </Panel>
    </>
  );
}
