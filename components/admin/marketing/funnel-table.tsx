import { fmtMoney } from "@/lib/os/money";
import type { FunnelRow } from "@/lib/marketing/attribution";
import { EmptyState, TableWrap, td, th } from "@/components/admin/ui";

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 1000) / 10}%` : "—");

export function FunnelTable({ rows, keyLabel, link }: { rows: FunnelRow[]; keyLabel: string; link?: (k: string) => string | undefined }) {
  if (!rows.length) return <EmptyState title="No leads in this period" description="Attribution fills in as website leads arrive with UTM parameters." />;
  return (
    <TableWrap>
      <thead><tr>{[keyLabel, "Leads", "Qualified", "Qual. rate", "Proposals", "Won", "Conversion", "Won value"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key} className="hover:bg-ink-850">
            <td className={`${td} max-w-[280px] truncate font-medium`}>{link?.(r.key) ? <a href={link(r.key)} className="hover:text-brand-blue">{r.key}</a> : r.key}</td>
            <td className={`${td} tabular-nums`}>{r.leads}</td>
            <td className={`${td} tabular-nums`}>{r.qualified}</td>
            <td className={`${td} tabular-nums text-muted`}>{pct(r.qualified, r.leads)}</td>
            <td className={`${td} tabular-nums`}>{r.proposals}</td>
            <td className={`${td} tabular-nums`}>{r.won}</td>
            <td className={`${td} tabular-nums text-muted`}>{pct(r.won, r.leads)}</td>
            <td className={`${td} whitespace-nowrap tabular-nums`}>{r.wonValue.length ? r.wonValue.map((v) => fmtMoney(v.amount, v.currency, { compact: true })).join(" · ") : "—"}</td>
          </tr>
        ))}
      </tbody>
    </TableWrap>
  );
}
