import Link from "next/link";
import { FileText } from "lucide-react";
import { db } from "@/lib/db/client";
import type { Prisma } from "@/lib/generated/prisma/client";
import { uploadDocumentAction, setDocumentVisibilityAction, archiveDocumentAction, type DocTarget } from "@/lib/os/document-actions";
import { addNoteAction, type NoteTarget } from "@/lib/os/note-actions";
import { Panel, fmtDate, inputCls, label } from "./ui";
import { SubmitButton } from "./client";
import { ActionForm, FieldError } from "./forms";
import { StatusBadge, Timeline } from "./os";

const size = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export async function DocumentsPanel({ target, where, canManage, clientVisible = true }: { target: DocTarget; where: Prisma.DocumentWhereInput; canManage: boolean; clientVisible?: boolean }) {
  const docs = await db.document.findMany({ where: { ...where, deletedAt: null }, orderBy: { createdAt: "desc" }, take: 50, include: { uploadedBy: { select: { name: true } } } });
  return (
    <Panel title={`Documents (${docs.length})`}>
      {docs.length === 0 ? (
        <p className="text-sm text-dim">No documents yet.</p>
      ) : (
        <ul className="divide-y divide-line">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center gap-2 py-2 text-sm">
              <FileText className="size-4 shrink-0 text-dim" aria-hidden />
              <div className="min-w-0 flex-1">
                <a href={`/admin/documents/${d.id}/download`} className="block truncate font-medium text-fg hover:text-brand-blue">{d.name}</a>
                <span className="text-xs text-dim">{size(d.size)} · {d.uploadedBy?.name ?? (d.portalUserId ? "Client" : "—")} · {fmtDate(d.createdAt)}</span>
              </div>
              <StatusBadge value={d.visibility} text={d.visibility === "CLIENT" ? "Client-visible" : "Internal"} />
              {canManage && (
                <div className="flex shrink-0 gap-1">
                  {clientVisible && (
                    <form action={setDocumentVisibilityAction.bind(null, d.id, d.visibility === "CLIENT" ? "INTERNAL" : "CLIENT")}>
                      <button type="submit" className="text-xs text-muted hover:text-fg">{d.visibility === "CLIENT" ? "Hide" : "Share"}</button>
                    </form>
                  )}
                  <form action={archiveDocumentAction.bind(null, d.id)}>
                    <button type="submit" className="text-xs text-muted hover:text-red-700">Remove</button>
                  </form>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {canManage && (
        <ActionForm action={uploadDocumentAction.bind(null, target)} resetOnOk className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
          <input type="file" name="files" multiple aria-label="Files" className={`${inputCls} h-auto min-w-0 flex-1 py-1.5 text-xs`} />
          {clientVisible && (
            <select name="visibility" aria-label="Visibility" defaultValue="INTERNAL" className="h-9 rounded-md border border-line-strong bg-ink-900 px-2 text-[13px]">
              <option value="INTERNAL">Internal</option>
              <option value="CLIENT">Visible to client</option>
            </select>
          )}
          <SubmitButton variant="secondary">Upload</SubmitButton>
        </ActionForm>
      )}
    </Panel>
  );
}

const TITLES: Record<string, string> = { NOTE: "Note", CREATED: "Created", UPDATED: "Updated", STAGE_CHANGED: "Stage changed", STATUS_CHANGED: "Status changed", WON: "Won", LOST: "Lost", SENT: "Sent", VIEWED: "Viewed by client", ACCEPTED: "Accepted", REJECTED: "Rejected", APPROVED: "Approved", REVISED: "New version", PAYMENT: "Payment", AI: "AI" };

export async function ActivityPanel({ where, note, title = "Timeline", take = 60 }: { where: Prisma.ActivityWhereInput; note?: NoteTarget; title?: string; take?: number }) {
  const rows = await db.activity.findMany({ where, orderBy: { createdAt: "desc" }, take, include: { actor: { select: { name: true } } } });
  return (
    <Panel title={title}>
      {note && (
        <ActionForm action={addNoteAction.bind(null, note)} resetOnOk className="mb-4">
          <label htmlFor={`note-${note.id}`} className="sr-only">Add a note</label>
          <textarea id={`note-${note.id}`} name="body" rows={2} placeholder="Add an internal note…" className={`${inputCls} h-auto py-2`} />
          <FieldError name="body" />
          <SubmitButton variant="secondary" className="mt-2">Add note</SubmitButton>
        </ActionForm>
      )}
      <Timeline
        items={rows.map((a) => ({
          id: a.id,
          at: a.createdAt,
          kind: a.aiAgent ? "AI" : undefined,
          title: TITLES[a.type] ?? label(a.type),
          detail: a.summary ? <span className={a.type === "NOTE" ? "block whitespace-pre-wrap text-fg" : undefined}>{a.summary}</span> : undefined,
          who: a.actor?.name ?? (a.aiAgent ? `AI · ${a.aiAgent}` : "System"),
        }))}
      />
    </Panel>
  );
}

export function RelatedList({ title, items, empty, action }: { title: string; items: { id: string; href: string; label: string; right?: React.ReactNode; status?: string }[]; empty: string; action?: React.ReactNode }) {
  return (
    <Panel title={title} action={action}>
      {items.length === 0 ? (
        <p className="text-sm text-dim">{empty}</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {items.map((i) => (
            <li key={i.id} className="flex items-center justify-between gap-2">
              <Link href={i.href} className="min-w-0 truncate font-medium text-fg hover:text-brand-blue">{i.label}</Link>
              <span className="flex shrink-0 items-center gap-2">
                {i.right && <span className="text-xs text-muted tabular-nums">{i.right}</span>}
                {i.status && <StatusBadge value={i.status} />}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
