import { ActionForm, type FormResult } from "@/components/admin/forms";
import { SubmitButton } from "@/components/admin/client";
import { inputCls } from "@/components/admin/ui";

/** Approve / reject buttons with an optional note, for leave requests. */
export function DecideLeave({ approve, reject }: { approve: (s: FormResult, f: FormData) => Promise<FormResult>; reject: (s: FormResult, f: FormData) => Promise<FormResult> }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <ActionForm action={approve} className="flex items-center gap-1.5">
        <input name="note" placeholder="Note (optional)" aria-label="Note" className={`${inputCls} h-8 w-40 text-xs`} maxLength={500} />
        <SubmitButton className="h-8 px-2.5 text-xs">Approve</SubmitButton>
      </ActionForm>
      <ActionForm action={reject}>
        <SubmitButton variant="danger" className="h-8 px-2.5 text-xs">Reject</SubmitButton>
      </ActionForm>
    </div>
  );
}
