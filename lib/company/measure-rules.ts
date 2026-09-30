/**
 * Control-loop rules (pure): which stage of the lead funnel is the bottleneck and what the next action is.
 * Inputs are real counts; the output names the numbers behind every decision. Nothing here executes anything.
 */

export interface FunnelCounts {
  discovered: number;
  withEmail: number;
  verified: number;
  qualified: number;
  contacted: number;
  replied: number;
}

export interface LoopProviders {
  discovery: boolean;
  verification: boolean;
}

export interface NextStep {
  bottleneck: "DISCOVERY" | "ENRICHMENT" | "VERIFICATION" | "QUALIFICATION" | "OUTREACH" | "MESSAGING" | "VOLUME" | "ON_TARGET";
  owner: string;
  action: string;
}

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);

/** The first failing stage of the funnel decides the next action; a stage with too little data is not judged. */
export function leadNextStep(f: FunnelCounts, today: number, target: number | null, p: LoopProviders): NextStep {
  if (!f.discovered) {
    return p.discovery
      ? { bottleneck: "DISCOVERY", owner: "leadgen-director", action: "No prospects discovered yet: run the lead pipeline and widen the ICP (titles, countries, domains) if searches return nothing." }
      : { bottleneck: "DISCOVERY", owner: "leadgen-director", action: "No discovery provider CONNECTED: connect Apollo or Hunter in the Integration Center, then run the lead pipeline." };
  }
  if (f.discovered >= 10 && f.withEmail / f.discovered < 0.5) return { bottleneck: "ENRICHMENT", owner: "leadgen-director", action: `Only ${pct(f.withEmail, f.discovered)}% of ${f.discovered} prospects have an email: run enrichment (Apollo match / Hunter email-finder) before sourcing more.` };
  if (f.withEmail && !f.verified) {
    return p.verification
      ? { bottleneck: "VERIFICATION", owner: "leadgen-director", action: `${f.withEmail} emails await verification: run the lead pipeline to verify them.` }
      : { bottleneck: "VERIFICATION", owner: "leadgen-director", action: "No verification provider CONNECTED: connect NeverBounce or Hunter — unverified prospects are never qualified or contacted." };
  }
  if (f.verified >= 10 && f.qualified / f.verified < 0.2) return { bottleneck: "QUALIFICATION", owner: "leadgen-director", action: `Only ${pct(f.qualified, f.verified)}% of ${f.verified} verified prospects fit the ICP: tighten sourcing to the ICP or review the minimum fit score.` };
  if (f.qualified >= 5 && f.contacted / f.qualified < 0.5) return { bottleneck: "OUTREACH", owner: "leadgen-director", action: `${f.qualified - f.contacted} qualified prospects are not in a sequence: request enrolment in an OUTBOUND sequence (approval required).` };
  if (f.contacted >= 50 && f.replied / f.contacted < 0.02) return { bottleneck: "MESSAGING", owner: "cmo", action: `Reply rate ${pct(f.replied, f.contacted)}% on ${f.contacted} contacted: revise the offer and the first-touch message.` };
  if (target != null && today < target) return { bottleneck: "VOLUME", owner: "leadgen-director", action: `${today} of ${target} qualified today (gap ${Math.round((target - today) * 10) / 10}): raise daily discovery within provider caps and the campaign's daily target.` };
  return { bottleneck: "ON_TARGET", owner: "growth-director", action: target != null ? `On target (${today}/${target} today): keep the pipeline running and review channel mix weekly.` : "Funnel is healthy: keep the pipeline running." };
}

/** Revenue gap in one currency. */
export function revenueNextStep(actual: number, target: number, currency: string, riskyDeals: number): NextStep {
  if (actual >= target) return { bottleneck: "ON_TARGET", owner: "cro", action: `Target reached: ${actual} ${currency} won against ${target}.` };
  return { bottleneck: "VOLUME", owner: "cro", action: `Gap ${Math.round((target - actual) * 100) / 100} ${currency}: work the ${riskyDeals} at-risk open deal(s) first (Sales Autonomy → deal risks) and add pipeline through lead generation.` };
}
