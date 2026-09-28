import "server-only";
import { fmtMulti } from "@/lib/os/money";
import { KILL_SWITCHES, type KillSwitch } from "./policy";
import { getGrowthSettings } from "./settings";
import { growthSnapshot } from "./snapshot";

/**
 * Growth section of the rules-based CEO briefing. FACTS are counts from records; RECOMMENDATIONS are rule-derived
 * suggestions, labelled as such. Missing data is stated, never estimated.
 */
export async function growthBriefingLines(): Promise<string[]> {
  const s = await getGrowthSettings();
  const g = await growthSnapshot({ from: new Date(Date.now() - 7 * 86400_000), to: new Date() }, s.dailyQualifiedLeadTarget);
  const stops = (Object.keys(s.stops) as KillSwitch[]).filter((k) => s.stops[k]);
  const money = (m: { currency: string; amount: number }[]) => (m.length ? fmtMulti(m.map((x) => ({ currency: x.currency, amount: String(x.amount) }))) : "none recorded");
  const facts = [
    "**Growth — FACTS (last 7 days)**",
    `- Qualified leads today: ${g.qualifiedToday} (configured target ${g.target}/day — a target, not a guarantee)`,
    `- Leads ${g.leads} · qualified ${g.qualified} · sales-ready ${g.salesReady} · meetings ${g.meetings} · deals won ${g.deals}`,
    `- Followers: ${g.followers.total == null ? "no connected or entered social data" : `${g.followers.total}${g.followers.change != null ? ` (${g.followers.change >= 0 ? "+" : ""}${g.followers.change})` : ""}`}`,
    `- Ad spend: ${money(g.spend)}${g.costPerQualified ? ` · cost per qualified lead ${g.costPerQualified.currency} ${g.costPerQualified.value}` : ""}`,
    `- Autonomous mode: ${s.autonomousMode ? "ON" : "off"}${stops.length ? ` · kill switches ON: ${stops.map((k) => KILL_SWITCHES[k]).join("; ")}` : ""}`,
  ];
  const recs: string[] = [];
  if (g.salesReady > 0) recs.push(`Contact the ${g.salesReady} sales-ready lead(s) from this week first.`);
  if (g.pendingApprovals.posts + g.pendingApprovals.assets > 0) recs.push(`Review ${g.pendingApprovals.posts} social post(s) and ${g.pendingApprovals.assets} content draft(s) waiting for approval.`);
  if (g.followers.total == null) recs.push("Connect at least one social platform so follower growth is measured from real data.");
  if (!g.spend.length && g.leads > 0) recs.push("Enter campaign spend so cost per lead and ROAS can be calculated.");
  return [...facts, "", "**Growth — RECOMMENDATIONS (rules, not AI analysis)**", ...(recs.length ? recs.map((r) => `- ${r}`) : ["- No growth actions stand out from the data."])];
}
