import { db } from "@/lib/db/client";
import type { Prisma } from "@/lib/generated/prisma/client";
import { can } from "@/lib/auth/permissions";
import { requireAccess } from "@/lib/os/guard";
import { CURRENCIES, byCurrency, fmtMoney, fmtMulti } from "@/lib/os/money";
import { archiveExpenseAction, saveExpenseAction } from "@/lib/finance/actions";
import { Panel, fmtDate } from "@/components/admin/ui";
import { SubmitButton } from "@/components/admin/client";
import { ActionForm } from "@/components/admin/forms";
import { ListView, SelectField, TextField, pageOf, str, PAGE_SIZE, type SP } from "@/components/admin/os";

export const metadata = { title: "Expenses" };
const CATEGORIES = ["Infrastructure", "Software", "Contractors", "Marketing", "Travel", "Office", "Legal", "Salaries", "Taxes", "Other"];

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireAccess("finance:view", "FINANCE");
  const sp = await searchParams;
  const values = { q: str(sp, "q", 80), category: str(sp, "category", 80), from: str(sp, "from", 10), to: str(sp, "to", 10), page: str(sp, "page") };
  const where: Prisma.ExpenseWhereInput = {
    deletedAt: null,
    ...(values.category && { category: values.category }),
    ...(values.q && { OR: [{ vendor: { contains: values.q, mode: "insensitive" } }, { description: { contains: values.q, mode: "insensitive" } }] }),
    ...((values.from || values.to) && { date: { ...(values.from && /^\d{4}-\d{2}-\d{2}$/.test(values.from) && { gte: new Date(`${values.from}T00:00:00Z`) }), ...(values.to && /^\d{4}-\d{2}-\d{2}$/.test(values.to) && { lte: new Date(`${values.to}T23:59:59Z`) }) } }),
  };
  const page = pageOf(sp);
  const [total, rows, sums, projects] = await Promise.all([
    db.expense.count({ where }),
    db.expense.findMany({ where, orderBy: { date: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, include: { project: { select: { name: true } }, createdBy: { select: { name: true } } } }),
    db.expense.groupBy({ by: ["currency"], where, _sum: { amount: true } }),
    db.project.findMany({ where: { deletedAt: null, status: { in: ["PLANNED", "ACTIVE", "ON_HOLD"] } }, orderBy: { name: "asc" }, take: 300, select: { id: true, name: true } }),
  ]);
  const manage = can(user.role, "finance:manage");
  const above = (
    <>
      <p className="mb-4 text-sm text-muted">Total for these filters: <span className="font-semibold text-fg">{fmtMulti(byCurrency(sums, (s) => s.currency, (s) => s._sum.amount))}</span></p>
      {manage && (
        <Panel title="Record expense" className="mb-5">
          <ActionForm action={saveExpenseAction.bind(null, null)} resetOnOk className="grid gap-3 sm:grid-cols-4 lg:grid-cols-8">
            <TextField name="date" label="Date" type="date" required />
            <SelectField name="category" label="Category" defaultValue="Software" options={CATEGORIES.map((c) => [c, c] as const)} />
            <TextField name="vendor" label="Vendor" maxLength={200} />
            <TextField name="amount" label="Amount" required />
            <SelectField name="currency" label="Currency" defaultValue="USD" options={CURRENCIES.map((c) => [c, c] as const)} />
            <SelectField name="projectId" label="Project" blank="—" options={projects.map((p) => [p.id, p.name] as const)} />
            <TextField name="description" label="Description" maxLength={1000} />
            <div className="flex items-end"><SubmitButton>Add</SubmitButton></div>
          </ActionForm>
        </Panel>
      )}
    </>
  );
  return (
    <ListView title="Expenses" crumbs={[{ label: "Finance", href: "/admin/finance" }, { label: "Expenses" }]} above={above} values={values}
      filters={[{ type: "search", name: "q", placeholder: "Search vendor or description…" }, { type: "select", name: "category", label: "All categories", options: CATEGORIES.map((c) => [c, c] as const) }, { type: "date", name: "from", label: "From" }, { type: "date", name: "to", label: "To" }]}
      rows={rows} total={total} page={page} basePath="/admin/finance/expenses" empty={{ title: "No expenses recorded" }}
      columns={[
        { header: "Date", cell: (e) => <span className="whitespace-nowrap text-muted">{fmtDate(e.date)}</span> },
        { header: "Category", cell: (e) => <span>{e.category}</span> },
        { header: "Vendor", cell: (e) => <span className="text-muted">{e.vendor ?? "—"}</span> },
        { header: "Description", cell: (e) => <span className="max-w-[260px] truncate text-muted">{e.description ?? "—"}</span> },
        { header: "Project", cell: (e) => <span className="text-muted">{e.project?.name ?? "—"}</span> },
        { header: "Amount", cell: (e) => <span className="whitespace-nowrap tabular-nums">{fmtMoney(e.amount, e.currency)}</span> },
        { header: "", cell: (e) => (manage ? <form action={archiveExpenseAction.bind(null, e.id)}><button type="submit" className="text-xs text-muted hover:text-red-700">Remove</button></form> : null) },
      ]}
    />
  );
}
