import "server-only";
import { db } from "@/lib/db/client";
import { audit } from "@/lib/audit";
import type { SessionUser } from "@/lib/auth/session";
import { isEmail } from "@/lib/growth/email-rules";
import { enrichmentProvider, leadProviders } from "@/lib/growth/providers";
import { mailMode, sendMail } from "@/lib/email/mailer";
import type { AdsProviderKey } from "@/lib/ads/providers";
import { integrationByKey } from "./catalog";
import { integrationStatuses, testIntegration } from "./health";
import { googleAccessToken, refreshLinkedInToken, refreshXToken } from "./oauth";
import { hydrateVault, secretValue } from "./vault";

/**
 * Provider certification mode: a person runs a real, authenticated check of a connected provider and gets a
 * step-by-step record. Safety by construction:
 *  - only read-only calls by default;
 *  - the one test email goes ONLY to CERTIFICATION_TEST_EMAIL from the server environment (never a form field, never
 *    a lead), and only when the person ticks "send test email" — so it cannot become production sending;
 *  - the ads check can create ONE campaign that is PAUSED at the provider and is never launched by certification;
 *  - social certification is draft-only: nothing is published (platforms offer no sandbox for page posts);
 *  - a provider without credentials is NOT_CONNECTED — nothing is simulated.
 */

export type StepResult = "PASS" | "FAIL" | "NOT_CONNECTED" | "SKIPPED" | "REQUIRES_HUMAN";
export interface CertStep {
  name: string;
  result: StepResult;
  detail: string;
}
export type Verdict = "LIVE_CERTIFIED" | "PARTIALLY_CERTIFIED" | "NOT_CONNECTED" | "FAILED";
export interface CertRun {
  provider: string;
  at: string;
  by: string | null;
  verdict: Verdict;
  steps: CertStep[];
}

export const CERTIFIABLE = ["anthropic", "openai", "apollo", "hunter", "neverbounce", "linkedin-app", "meta-app", "x-app", "google-app", "linkedin", "facebook", "instagram", "x", "youtube", "meta-ads", "google-ads", "linkedin-ads", "ga4", "gsc", "email"] as const;

/** The controlled certification recipient (server environment only). */
export const certificationRecipient = () => {
  const v = (process.env.CERTIFICATION_TEST_EMAIL ?? "").trim().toLowerCase();
  return isEmail(v) ? v : null;
};

export function verdictOf(steps: CertStep[]): Verdict {
  if (steps.some((s) => s.result === "NOT_CONNECTED") && !steps.some((s) => s.result === "PASS")) return "NOT_CONNECTED";
  if (steps.some((s) => s.result === "FAIL")) return "FAILED";
  if (steps.every((s) => s.result === "PASS")) return "LIVE_CERTIFIED";
  return "PARTIALLY_CERTIFIED";
}

export interface CertOptions {
  /** Send one test email to CERTIFICATION_TEST_EMAIL (email provider only). */
  sendTestEmail?: boolean;
  /** Create one PAUSED ad campaign at the provider (ads only; never launched). */
  createPausedCampaign?: boolean;
}

export async function certifyProvider(key: string, user: SessionUser, opts: CertOptions = {}): Promise<CertRun> {
  await hydrateVault(true);
  const def = integrationByKey(key);
  const steps: CertStep[] = [];
  const step = (name: string, result: StepResult, detail: string) => steps.push({ name, result, detail });
  if (!def || !(CERTIFIABLE as readonly string[]).includes(key)) throw new Error("This integration has no certification procedure.");

  // 1. Connection + authenticated read-only check (the Integration Center health check).
  const health = await testIntegration(key);
  if (health.state === "NOT_CONNECTED") step("Credentials present", "NOT_CONNECTED", "No credentials stored or in the environment.");
  else step("Authenticated read-only check", health.state === "CONNECTED" ? "PASS" : "FAIL", `${health.state}: ${health.message}`);
  const live = health.state === "CONNECTED";

  // 2. Provider-specific certification steps.
  switch (key) {
    case "anthropic": {
      if (!live) break;
      const { runAgent } = await import("@/lib/ai/runner");
      const r = await runAgent({ agentSlug: "ceo", user, request: "Certification check. Do not call any tool. Reply with exactly: CERTIFIED" });
      step("Model call through the AI runtime (metered, budget-guarded)", r.status === "SUCCEEDED" && /CERTIFIED/.test(r.text ?? "") ? "PASS" : "FAIL", `Execution ${r.executionId ?? "—"}: ${r.status}`);
      const usage = r.executionId ? await db.aIUsage.aggregate({ where: { executionId: r.executionId }, _sum: { costUsd: true, inputTokens: true, outputTokens: true } }) : null;
      step("Cost and token usage recorded", usage && (usage._sum.inputTokens ?? 0) > 0 ? "PASS" : "FAIL", usage ? `${(usage._sum.inputTokens ?? 0) + (usage._sum.outputTokens ?? 0)} tokens, $${Number(usage._sum.costUsd ?? 0).toFixed(4)}` : "no usage row");
      break;
    }
    case "apollo": {
      if (!live) break;
      const r = await leadProviders.apollo.peopleSearch({ titles: ["CEO"], perPage: 1 });
      step("People search (1 result, read-only)", r.ok ? "PASS" : "FAIL", r.ok ? `${r.data.length} record(s) returned; nothing was imported` : r.error);
      break;
    }
    case "hunter":
    case "neverbounce": {
      if (!live) break;
      const to = certificationRecipient();
      if (!to) step("Verify a controlled address", "SKIPPED", "Set CERTIFICATION_TEST_EMAIL on the server to verify one controlled address (uses one credit).");
      else if (key === "neverbounce" || !enrichmentProvider.status().connected || !secretValue("NEVERBOUNCE_API_KEY")) {
        const r = await enrichmentProvider.verifyEmail(to);
        step("Verify the controlled certification address", r.ok ? "PASS" : "FAIL", r.ok ? `status: ${r.data.status}` : r.error);
      } else step("Verify a controlled address", "SKIPPED", "NeverBounce is the active verifier; certify NeverBounce instead.");
      break;
    }
    case "google-app": {
      if (!live) break;
      step("Refresh token → access token", (await googleAccessToken()) ? "PASS" : "FAIL", "Google issued (or refused) a short-lived access token from the stored refresh token.");
      break;
    }
    case "x-app": {
      if (!live) break;
      if (!secretValue("X_REFRESH_TOKEN")) step("Token refresh", "SKIPPED", "No refresh token stored (offline.access not granted).");
      else step("Token refresh (rotates the refresh token)", (await refreshXToken(user.id)) ? "PASS" : "FAIL", "X issued a new token pair, stored encrypted.");
      break;
    }
    case "linkedin-app": {
      if (!live) break;
      if (!secretValue("LINKEDIN_REFRESH_TOKEN")) step("Token refresh", "SKIPPED", "LinkedIn issued no refresh token (programmatic refresh is enabled per partner); the sign-in lasts until its expiry, then EXPIRED is shown.");
      else step("Token refresh", (await refreshLinkedInToken(user.id)) ? "PASS" : "FAIL", "LinkedIn issued a new access token, stored encrypted.");
      break;
    }
    case "linkedin":
    case "facebook":
    case "instagram":
    case "x":
    case "youtube":
      if (live) step("Publishing", "REQUIRES_HUMAN", key === "youtube" ? "NOT SUPPORTED by design: videos are uploaded in YouTube Studio." : "Draft-only certification: nothing is published. To certify publishing, approve one real post in the social queue; it counts only after the platform returns a post ID.");
      break;
    case "meta-ads":
    case "google-ads":
    case "linkedin-ads": {
      if (!live) break;
      const provider = (key === "meta-ads" ? "meta" : key === "google-ads" ? "google" : "linkedin") as AdsProviderKey;
      if (!opts.createPausedCampaign) step("Create a PAUSED campaign", "SKIPPED", "Not requested. Tick “create paused test campaign” to certify campaign creation (no spend: it stays paused).");
      else {
        const { createAdCampaign, getAdsPolicy } = await import("@/lib/ads/engine");
        const policy = await getAdsPolicy();
        try {
          const row = await createAdCampaign({ provider, name: `[CERTIFICATION] Shivacha OS ${new Date().toISOString().slice(0, 10)}`, dailyBudget: Math.min(1, policy.maxCampaignDaily ?? 1), currency: "USD", countries: ["US"] }, user.id);
          step("Create a PAUSED campaign", row.status === "PAUSED" && row.externalId ? "PASS" : "FAIL", `Provider campaign ID ${row.externalId}; status ${row.status}. It is never launched by certification — delete it in the ad platform when done.`);
          const logged = await db.auditLog.count({ where: { action: "ads.campaign.created", entityId: row.id } });
          step("Audit trail", logged ? "PASS" : "FAIL", logged ? "ads.campaign.created recorded" : "missing");
        } catch (e) {
          step("Create a PAUSED campaign", "FAIL", (e as Error).message.slice(0, 300));
        }
      }
      step("Live spend", "REQUIRES_HUMAN", "Launching spends real money: certify it only with a person's launch under the ads policy (daily limit set), then confirm spend sync and the automatic pause.");
      break;
    }
    case "email": {
      if (mailMode() === "none") break;
      const to = certificationRecipient();
      if (!opts.sendTestEmail) step("Send a test email", "SKIPPED", "Not requested.");
      else if (!to) step("Send a test email", "SKIPPED", "Set CERTIFICATION_TEST_EMAIL on the server; certification never emails anyone else.");
      else {
        const r = await sendMail({ to, subject: "[Shivacha OS] Email provider certification", text: `Certification test sent at ${new Date().toISOString()} by ${user.email}. No action needed.`, html: `<p>Certification test sent at ${new Date().toISOString()}. No action needed.</p>` });
        step("Send one test email to the certification address", r.sent ? "PASS" : "FAIL", r.sent ? `Accepted by the mail server for ${to.replace(/^(.).*(@.*)$/, "$1…$2")}` : (r.error ?? "not sent"));
      }
      break;
    }
    default:
      break;
  }

  const run: CertRun = { provider: key, at: new Date().toISOString(), by: user.id, verdict: verdictOf(steps), steps };
  await db.integration.upsert({ where: { key: `cert:${key}` }, update: { status: run.verdict === "FAILED" ? "ERROR" : run.verdict === "NOT_CONNECTED" ? "NOT_CONNECTED" : "CONNECTED", lastSyncAt: new Date(), lastError: null, config: JSON.parse(JSON.stringify(run)) }, create: { key: `cert:${key}`, status: run.verdict === "FAILED" ? "ERROR" : run.verdict === "NOT_CONNECTED" ? "NOT_CONNECTED" : "CONNECTED", lastSyncAt: new Date(), config: JSON.parse(JSON.stringify(run)) } });
  await audit({ userId: user.id, action: "integration.certification.run", entity: "Integration", entityId: key, metadata: { verdict: run.verdict, steps: steps.map((s) => `${s.name}: ${s.result}`) } });
  return run;
}

/** Latest certification per provider, next to its current health state. */
export async function certificationOverview() {
  const [statuses, runs] = await Promise.all([integrationStatuses(), db.integration.findMany({ where: { key: { startsWith: "cert:" } } })]);
  return CERTIFIABLE.map((key) => {
    const s = statuses.find((x) => x.def.key === key);
    const run = (runs.find((r) => r.key === `cert:${key}`)?.config ?? null) as CertRun | null;
    return { key, name: s?.def.name ?? key, state: s?.state ?? "NOT_CONNECTED", run };
  });
}
