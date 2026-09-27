/**
 * Transparent intent scoring. Every point comes from a named signal the team can see on the visitor profile; the
 * score is never inferred from anything the visitor did not do on this website.
 */
export interface IntentFacts {
  paths: string[];
  eventTypes: string[];
  sessions: number;
  totalSeconds: number;
  companyIdentified: boolean;
  identifiedLead: boolean;
}
export interface IntentSignal {
  signal: string;
  points: number;
  detail: string;
}

const has = (paths: string[], re: RegExp) => paths.filter((p) => re.test(p));

export function scoreIntent(f: IntentFacts): { score: number; label: "LOW" | "MEDIUM" | "HIGH"; signals: IntentSignal[] } {
  const s: IntentSignal[] = [];
  const add = (signal: string, points: number, detail: string) => points > 0 && s.push({ signal, points, detail });
  const unique = [...new Set(f.paths)];
  const pricing = has(unique, /(^|\/)(pricing|estimate|cost|quote)/i);
  add("Pricing / estimate pages", pricing.length ? 15 : 0, pricing.slice(0, 3).join(", "));
  const contact = has(unique, /(^|\/)(contact|book|start-project|get-started|hire)/i);
  add("Contact / hire pages", contact.length ? 15 : 0, contact.slice(0, 3).join(", "));
  const services = has(unique, /^\/services\//);
  add("Service pages viewed", Math.min(15, services.length * 5), `${services.length} service page(s)`);
  const cases = has(unique, /^\/(case-studies|work|portfolio)\//);
  add("Case studies viewed", Math.min(10, cases.length * 5), `${cases.length} case stud${cases.length === 1 ? "y" : "ies"}`);
  add("Returning visitor", f.sessions >= 4 ? 15 : f.sessions >= 2 ? 10 : 0, `${f.sessions} visits`);
  add("Time on site", f.totalSeconds >= 600 ? 15 : f.totalSeconds >= 180 ? 8 : 0, `${Math.round(f.totalSeconds / 60)} min`);
  const count = (t: string) => f.eventTypes.filter((x) => x === t).length;
  add("CTA clicks", Math.min(10, count("cta_click") * 5), `${count("cta_click")} click(s)`);
  add("Started a form", count("form_start") ? 15 : 0, "form_start");
  const direct = ["calendly_click", "whatsapp_click", "phone_click", "email_click"].filter((t) => count(t));
  add("Contact action", direct.length ? 20 : 0, direct.join(", "));
  add("Downloaded a resource", count("download") ? 10 : 0, "download");
  add("Submitted a form", f.identifiedLead || count("form_submit") ? 30 : 0, "Became a lead");
  add("Company identified", f.companyIdentified ? 5 : 0, "Provider match");
  const score = Math.min(100, s.reduce((a, x) => a + x.points, 0));
  return { score, label: score >= 60 ? "HIGH" : score >= 30 ? "MEDIUM" : "LOW", signals: s };
}
