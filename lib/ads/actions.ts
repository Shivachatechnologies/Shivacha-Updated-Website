"use server";

import { z } from "zod";
import { authorizeAccess } from "@/lib/os/guard";
import { can } from "@/lib/auth/permissions";
import { fail, formObject, okThen, UserError, type ActionState } from "@/lib/os/action";
import { AdsError, createAdCampaign, launchAdCampaign, pauseAdCampaign, pauseAll, saveAdsPolicy, setAdBudget, syncAdSpend } from "./engine";
import { parseAdsPolicy } from "./policy";

const P = "/admin/marketing/ads";
const wrap = (e: unknown) => (e instanceof AdsError ? new UserError(e.message) : e);
const amount = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  if (!s) return null;
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(s)) throw new UserError("Enter amounts like 50 or 49.99.");
  return Number(s);
};

/** CEO-level control: spend limits, autonomous policy and the emergency stop (growth:control only). */
export async function saveAdsPolicyAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorizeAccess("growth:control", "GROWTH");
    const p = parseAdsPolicy({ autonomous: form.get("autonomous") === "on", autoApproveUpTo: amount(form.get("autoApproveUpTo")) ?? 0, dailySpendLimit: amount(form.get("dailySpendLimit")), monthlyAccountBudget: amount(form.get("monthlyAccountBudget")), maxCampaignDaily: amount(form.get("maxCampaignDaily")), emergencyStop: form.get("emergencyStop") === "on" });
    await saveAdsPolicy(p, user.id);
    return okThen(P, p.emergencyStop ? "Emergency stop ON: every active campaign was paused." : "Ads policy saved.");
  } catch (e) {
    return fail(wrap(e), "ads");
  }
}

export async function createAdCampaignAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorizeAccess("growth:manage", "GROWTH");
    if (!can(user.role, "marketing:manage")) throw new UserError("You need marketing management permission.");
    const d = z.object({ provider: z.enum(["meta", "google", "linkedin"]), name: z.string().trim().min(3).max(200), currency: z.string().trim().length(3), countries: z.string().trim().min(2).max(200), headline: z.string().trim().max(120).optional(), body: z.string().trim().max(1000).optional(), link: z.preprocess((v) => (v ? v : undefined), z.string().trim().url().max(500).optional()), campaignId: z.preprocess((v) => (v ? v : undefined), z.string().max(40).optional()) }).parse(formObject(form));
    const daily = amount(form.get("dailyBudget"));
    if (!daily) throw new UserError("Enter a daily budget.");
    const row = await createAdCampaign({ ...d, currency: d.currency.toUpperCase(), dailyBudget: daily, countries: d.countries.split(/[,\s]+/).filter(Boolean) }, user.id);
    return okThen(P, `Created PAUSED at ${d.provider} (id ${row.externalId}). Nothing spends until it is launched.`);
  } catch (e) {
    return fail(wrap(e), "ads");
  }
}

/** A person with growth:control is the approver: launch runs every spend check first. */
export async function launchAdAction(id: string): Promise<ActionState> {
  try {
    const user = await authorizeAccess("growth:control", "GROWTH");
    await launchAdCampaign(id, { userId: user.id, via: "HUMAN" });
    return okThen(P, "Launched: the provider confirmed the campaign is active.");
  } catch (e) {
    return fail(wrap(e), "ads");
  }
}

export async function pauseAdAction(id: string): Promise<ActionState> {
  try {
    const user = await authorizeAccess("growth:manage", "GROWTH");
    await pauseAdCampaign(id, user.id, `Paused by ${user.name}`);
    return okThen(P, "Paused at the provider.");
  } catch (e) {
    return fail(wrap(e), "ads");
  }
}

export async function changeAdBudgetAction(id: string, _: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorizeAccess("growth:control", "GROWTH");
    const v = amount(form.get("dailyBudget"));
    if (!v) throw new UserError("Enter a daily budget.");
    await setAdBudget(id, v, { userId: user.id, via: "HUMAN" });
    return okThen(P, "Daily budget updated at the provider.");
  } catch (e) {
    return fail(wrap(e), "ads");
  }
}

export async function syncAdsAction(): Promise<ActionState> {
  try {
    await authorizeAccess("growth:manage", "GROWTH");
    const r = await syncAdSpend(14);
    return okThen(P, `Synced ${r.synced} campaign(s) from the platforms${r.errors.length ? ` · ${r.errors.length} error(s): ${r.errors[0]}` : ""}${r.guard ? ` · GUARD: ${r.guard}` : ""}.`);
  } catch (e) {
    return fail(wrap(e), "ads");
  }
}

export async function pauseAllAdsAction(): Promise<ActionState> {
  try {
    const user = await authorizeAccess("growth:manage", "GROWTH");
    const r = await pauseAll(`Pause all by ${user.name}`, user.id);
    return okThen(P, `${r.paused} paused${r.failed.length ? `; NOT confirmed by the provider: ${r.failed.join(", ")}` : ""}.`);
  } catch (e) {
    return fail(wrap(e), "ads");
  }
}
