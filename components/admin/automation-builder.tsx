"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { inputCls, labelCls } from "./ui";

type Cond = { field: string; op: string; value: string };
type Act = Record<string, string | number> & { type: string };

const OPS: [string, string][] = [["eq", "is"], ["neq", "is not"], ["contains", "contains"], ["in", "is one of (comma list)"], ["gt", ">"], ["gte", "≥"], ["lt", "<"], ["lte", "≤"], ["exists", "is set"]];
const ACTION_LABEL: Record<string, string> = { CREATE_TASK: "Create task", CREATE_FOLLOWUP: "Create follow-up (leads)", ASSIGN_OWNER: "Assign owner", SEND_EMAIL: "Send email", SEND_NOTIFICATION: "Send in-app notification", CREATE_TICKET: "Create support ticket", UPDATE_STATUS: "Update status", AI_AGENT: "Run AI agent (ASSIST mode)", WEBHOOK: "Call webhook (signed)" };
const DEFAULTS: Record<string, Act> = {
  CREATE_TASK: { type: "CREATE_TASK", title: "", assignTo: "owner", dueInDays: 1, priority: "MEDIUM" },
  CREATE_FOLLOWUP: { type: "CREATE_FOLLOWUP", note: "", dueInHours: 24, assignTo: "owner" },
  ASSIGN_OWNER: { type: "ASSIGN_OWNER", strategy: "round_robin", userId: "", role: "SALES_MANAGER" },
  SEND_EMAIL: { type: "SEND_EMAIL", to: "owner", subject: "", body: "" },
  SEND_NOTIFICATION: { type: "SEND_NOTIFICATION", to: "owner", title: "", body: "" },
  CREATE_TICKET: { type: "CREATE_TICKET", subject: "", priority: "MEDIUM", category: "GENERAL" },
  UPDATE_STATUS: { type: "UPDATE_STATUS", value: "" },
  AI_AGENT: { type: "AI_AGENT", agent: "sales", instruction: "" },
  WEBHOOK: { type: "WEBHOOK", url: "https://" },
};

export function AutomationBuilder({ triggers, fields, initialTrigger, initialConditions, initialActions, users, agents, roles }: { triggers: [string, string][]; fields: Record<string, string[]>; initialTrigger: string; initialConditions: Cond[]; initialActions: Act[]; users: [string, string][]; agents: [string, string][]; roles: string[] }) {
  const [trigger, setTrigger] = useState(initialTrigger);
  const [conds, setConds] = useState<Cond[]>(initialConditions);
  const [acts, setActs] = useState<Act[]>(initialActions.length ? initialActions : [DEFAULTS.SEND_NOTIFICATION]);
  const f = fields[trigger] ?? [];
  const setAct = (i: number, k: string, v: string | number) => setActs((xs) => xs.map((a, j) => (j === i ? { ...a, [k]: v } : a)));
  const input = (i: number, k: string, lbl: string, opts?: { type?: string; placeholder?: string; area?: boolean }) => (
    <label className="block text-xs">
      <span className="mb-0.5 block text-dim">{lbl}</span>
      {opts?.area ? (
        <textarea rows={3} value={String(acts[i][k] ?? "")} placeholder={opts.placeholder} onChange={(e) => setAct(i, k, e.target.value)} className={`${inputCls} h-auto py-1.5`} />
      ) : (
        <input type={opts?.type ?? "text"} value={String(acts[i][k] ?? "")} placeholder={opts?.placeholder} onChange={(e) => setAct(i, k, opts?.type === "number" ? Number(e.target.value) : e.target.value)} className={inputCls} />
      )}
    </label>
  );
  const select = (i: number, k: string, lbl: string, options: [string, string][]) => (
    <label className="block text-xs">
      <span className="mb-0.5 block text-dim">{lbl}</span>
      <select value={String(acts[i][k] ?? "")} onChange={(e) => setAct(i, k, e.target.value)} className={inputCls}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
  const recipients: [string, string][] = [["owner", "Record owner"], ["permission:leads:assign", "Sales leadership"], ["permission:finance:manage", "Finance team"], ["permission:support:manage", "Support team"], ["permission:projects:manage", "Project managers"], ...roles.map((r) => [`role:${r}`, `Role: ${r.replace(/_/g, " ").toLowerCase()}`] as [string, string]), ...users];
  return (
    <div className="space-y-5">
      <input type="hidden" name="trigger" value={trigger} />
      <input type="hidden" name="conditions" value={JSON.stringify(conds.filter((c) => c.field))} />
      <input type="hidden" name="actions" value={JSON.stringify(acts)} />
      <div>
        <p className={labelCls}>1 · When</p>
        <select aria-label="Trigger" value={trigger} onChange={(e) => { setTrigger(e.target.value); setConds([]); }} className={`${inputCls} max-w-md`}>
          {triggers.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      <div>
        <p className={labelCls}>2 · Only if (all conditions)</p>
        <ul className="space-y-2">
          {conds.map((c, i) => (
            <li key={i} className="flex flex-wrap items-center gap-2">
              <select aria-label="Field" value={c.field} onChange={(e) => setConds((xs) => xs.map((x, j) => (j === i ? { ...x, field: e.target.value } : x)))} className={`${inputCls} w-52`}>
                <option value="">Field…</option>
                {f.map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
              <select aria-label="Operator" value={c.op} onChange={(e) => setConds((xs) => xs.map((x, j) => (j === i ? { ...x, op: e.target.value } : x)))} className={`${inputCls} w-44`}>
                {OPS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              {c.op !== "exists" && <input aria-label="Value" value={c.value} onChange={(e) => setConds((xs) => xs.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} className={`${inputCls} w-52`} />}
              <button type="button" aria-label="Remove condition" onClick={() => setConds((xs) => xs.filter((_, j) => j !== i))} className="p-1 text-dim hover:text-red-700"><Trash2 className="size-4" /></button>
            </li>
          ))}
        </ul>
        <button type="button" onClick={() => setConds((xs) => [...xs, { field: f[0] ?? "", op: "eq", value: "" }])} className="btn-secondary mt-2 h-8 px-2.5 text-xs"><Plus className="size-3.5" /> Condition</button>
        {conds.length === 0 && <p className="mt-1 text-xs text-dim">No conditions — runs for every event.</p>}
      </div>
      <div>
        <p className={labelCls}>3 · Then do</p>
        <ol className="space-y-3">
          {acts.map((a, i) => (
            <li key={i} className="rounded-lg border border-line p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <select aria-label={`Action ${i + 1} type`} value={a.type} onChange={(e) => setActs((xs) => xs.map((x, j) => (j === i ? DEFAULTS[e.target.value] : x)))} className={`${inputCls} max-w-xs`}>
                  {Object.entries(ACTION_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                <button type="button" aria-label={`Remove action ${i + 1}`} onClick={() => setActs((xs) => xs.filter((_, j) => j !== i))} className="p-1 text-dim hover:text-red-700"><Trash2 className="size-4" /></button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {a.type === "CREATE_TASK" && (<>{input(i, "title", "Task title", { placeholder: "Call {{lead.name}}" })}{select(i, "assignTo", "Assign to", recipients.filter(([v]) => !v.startsWith("permission:")))}{input(i, "dueInDays", "Due in days", { type: "number" })}{select(i, "priority", "Priority", [["LOW", "Low"], ["MEDIUM", "Medium"], ["HIGH", "High"], ["URGENT", "Urgent"]])}</>)}
                {a.type === "CREATE_FOLLOWUP" && (<>{input(i, "note", "Note")}{input(i, "dueInHours", "Due in hours", { type: "number" })}{select(i, "assignTo", "Assign to", recipients.filter(([v]) => !v.startsWith("permission:")))}</>)}
                {a.type === "ASSIGN_OWNER" && (<>{select(i, "strategy", "Strategy", [["round_robin", "Round robin (fewest open leads)"], ["user", "Specific user"]])}{a.strategy === "user" ? select(i, "userId", "User", users) : select(i, "role", "Role", roles.map((r) => [r, r.replace(/_/g, " ").toLowerCase()]))}</>)}
                {a.type === "SEND_EMAIL" && (<>{select(i, "to", "To", [["customer", "Customer (goes to Approval Center)"], ...recipients])}{input(i, "subject", "Subject")}<div className="sm:col-span-2">{input(i, "body", "Body", { area: true })}</div></>)}
                {a.type === "SEND_NOTIFICATION" && (<>{select(i, "to", "Notify", recipients)}{input(i, "title", "Title")}<div className="sm:col-span-2">{input(i, "body", "Body", { area: true })}</div></>)}
                {a.type === "CREATE_TICKET" && (<>{input(i, "subject", "Subject")}{select(i, "priority", "Priority", [["LOW", "Low"], ["MEDIUM", "Medium"], ["HIGH", "High"], ["URGENT", "Urgent"]])}{select(i, "category", "Category", ["BUG", "FEATURE", "TECHNICAL", "BILLING", "GENERAL", "URGENT"].map((c) => [c, c.toLowerCase()]))}</>)}
                {a.type === "UPDATE_STATUS" && input(i, "value", "New status", { placeholder: "CONTACTED / IN_PROGRESS / ACTIVE…" })}
                {a.type === "AI_AGENT" && (<>{select(i, "agent", "Agent", agents)}<div className="sm:col-span-2">{input(i, "instruction", "Instruction", { area: true })}</div></>)}
                {a.type === "WEBHOOK" && <div className="sm:col-span-2">{input(i, "url", "HTTPS URL (signed with AUTOMATION_WEBHOOK_SECRET)")}</div>}
              </div>
            </li>
          ))}
        </ol>
        <button type="button" onClick={() => setActs((xs) => [...xs, DEFAULTS.CREATE_TASK])} className="btn-secondary mt-2 h-8 px-2.5 text-xs"><Plus className="size-3.5" /> Action</button>
        <p className="mt-2 text-xs text-dim">Use placeholders like {"{{lead.name}}"}, {"{{deal.value}}"}, {"{{invoice.number}}"}. Emails to customers are never sent automatically — they wait in the Human Approval Center.</p>
      </div>
    </div>
  );
}
