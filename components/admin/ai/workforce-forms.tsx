import { ActionForm, FieldError } from "@/components/admin/forms";
import { SubmitButton } from "@/components/admin/client";
import { inputCls, labelCls } from "@/components/admin/ui";
import { assignInstructionAction, assignTaskAction, taskControlAction } from "@/lib/ai/workforce/actions";
import { TASK_PRIORITIES } from "@/lib/ai/workforce/profiles";

type Emp = { slug: string; name: string; jobTitle?: string };

/** Create Task: employee, task, priority, deadline, instructions → ASSIGN TASK. */
export function AssignTaskForm({ employees, defaultAgent, compact }: { employees: Emp[]; defaultAgent?: string; compact?: boolean }) {
  return (
    <ActionForm action={assignTaskAction} className="space-y-3" resetOnOk>
      <label className="block">
        <span className={labelCls}>Employee</span>
        <select name="agent" defaultValue={defaultAgent ?? employees[0]?.slug} className={inputCls}>
          {employees.map((e) => <option key={e.slug} value={e.slug}>{e.name}{e.jobTitle ? ` — ${e.jobTitle}` : ""}</option>)}
        </select>
        <FieldError name="agent" />
      </label>
      <label className="block">
        <span className={labelCls}>Task</span>
        <input name="title" maxLength={200} required placeholder="Find 50 qualified fintech companies in the USA." className={inputCls} />
        <FieldError name="title" />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className={labelCls}>Priority</span>
          <select name="priority" defaultValue="MEDIUM" className={inputCls}>{TASK_PRIORITIES.map((p) => <option key={p} value={p}>{p[0] + p.slice(1).toLowerCase()}</option>)}</select>
        </label>
        <label className="block">
          <span className={labelCls}>Deadline</span>
          <select name="deadline" defaultValue="" className={inputCls}>
            <option value="">No deadline</option>
            <option value="today">Today</option>
            <option value="tomorrow">Tomorrow</option>
          </select>
        </label>
      </div>
      <label className="block">
        <span className={labelCls}>Instructions</span>
        <textarea name="instructions" rows={compact ? 3 : 5} maxLength={6000} placeholder="Context, constraints, what a good result looks like…" className={`${inputCls} h-auto py-2`} />
        <FieldError name="instructions" />
      </label>
      {!compact && (
        <label className="block">
          <span className={labelCls}>Start at (UTC, optional)</span>
          <input type="datetime-local" name="runAfter" className={inputCls} />
        </label>
      )}
      <SubmitButton className="w-full justify-center">Assign task</SubmitButton>
    </ActionForm>
  );
}

/** Assign Instruction: the CEO → AI employee channel. The instruction runs as a tracked task. */
export function AssignInstructionForm({ employees, defaultAgent }: { employees: Emp[]; defaultAgent?: string }) {
  return (
    <ActionForm action={assignInstructionAction} className="space-y-3" resetOnOk>
      <label className="block">
        <span className={labelCls}>To</span>
        <select name="agent" defaultValue={defaultAgent ?? "sales"} className={inputCls}>
          {employees.map((e) => <option key={e.slug} value={e.slug}>{e.name}</option>)}
        </select>
      </label>
      <label className="block">
        <span className={labelCls}>Instruction</span>
        <textarea name="instruction" rows={3} maxLength={4000} required placeholder="Prepare today's international sales pipeline and identify deals requiring immediate follow-up." className={`${inputCls} h-auto py-2`} />
        <FieldError name="instruction" />
      </label>
      <div className="flex items-center gap-2">
        <select name="priority" defaultValue="MEDIUM" aria-label="Priority" className={`${inputCls} w-32`}>{TASK_PRIORITIES.map((p) => <option key={p} value={p}>{p[0] + p.slice(1).toLowerCase()}</option>)}</select>
        <SubmitButton className="flex-1 justify-center">Assign</SubmitButton>
      </div>
    </ActionForm>
  );
}

/** Pause / Resume / Cancel / Retry buttons for one task, depending on its state. */
export function TaskControls({ id, status, size = "sm" }: { id: string; status: string; size?: "sm" | "md" }) {
  const cls = size === "sm" ? "h-7 rounded-md border border-line-strong px-2 text-[11.5px] font-medium hover:bg-ink-850" : "h-9 rounded-md border border-line-strong px-3 text-[13px] font-medium hover:bg-ink-850";
  const btn = (op: "pause" | "resume" | "cancel" | "retry", label: string, variant: "secondary" | "danger" = "secondary") => (
    <ActionForm key={op} action={taskControlAction.bind(null, id, op)}>
      <button type="submit" className={`${cls} ${variant === "danger" ? "text-red-700" : "text-fg"}`}>{label}</button>
    </ActionForm>
  );
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {(status === "QUEUED" || status === "RUNNING") && btn("pause", "Pause")}
      {status === "PAUSED" && btn("resume", "Resume")}
      {status === "FAILED" && btn("retry", "Retry")}
      {["QUEUED", "RUNNING", "PAUSED", "AWAITING_APPROVAL", "WAITING"].includes(status) && btn("cancel", "Cancel", "danger")}
    </div>
  );
}
