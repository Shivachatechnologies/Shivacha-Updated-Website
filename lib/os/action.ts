import "server-only";
import { z } from "zod";
import { AuthError } from "@/lib/auth/session";
import { CURRENCIES } from "./money";

/** Result shape consumed by <ActionForm> (toast + inline field errors + optional redirect). */
export type ActionState = { ok?: string; error?: string; fieldErrors?: Record<string, string>; redirect?: string } | undefined;

export class UserError extends Error {}

/** Converts any thrown error into a safe message. Stack traces and internals never reach the browser. */
export function fail(e: unknown, scope = "os"): ActionState {
  if (e instanceof AuthError) return { error: e.message };
  if (e instanceof UserError) return { error: e.message };
  if (e instanceof z.ZodError) return { error: "Please check the highlighted fields.", fieldErrors: Object.fromEntries(e.issues.map((i) => [String(i.path[0] ?? "form"), i.message])) };
  if ((e as Error)?.message === "INVALID_AMOUNT") return { error: "Enter a valid amount (up to 2 decimals)." };
  const code = (e as { code?: string })?.code;
  if (code === "P2002") return { error: "That value is already in use." };
  if (code === "P2025") return { error: "The record no longer exists." };
  console.error(`[${scope}] action failed`, (e as Error)?.message);
  return { error: "Something went wrong. Please try again." };
}

export const formObject = (form: FormData) => Object.fromEntries([...form.keys()].map((k) => [k, form.getAll(k).length > 1 ? form.getAll(k) : form.get(k)]));

export const optText = (max = 200) => z.preprocess((v) => (v == null ? undefined : v), z.string().trim().max(max, `Keep it under ${max} characters`).optional()).transform((v) => (v ? v : null));
export const reqText = (max = 200) => z.string({ error: "Required" }).trim().min(1, "Required").max(max, `Keep it under ${max} characters`);
export const optEmail = z.preprocess((v) => (v == null ? "" : v), z.string().trim().max(160)).refine((v) => !v || z.string().email().safeParse(v).success, "Invalid email").transform((v) => v || null);
export const optUrl = z.preprocess((v) => (v == null ? "" : v), z.string().trim().max(500)).refine((v) => !v || /^https?:\/\/[^\s]+$/i.test(v), "Use a full https:// URL").transform((v) => v || null);
export const optId = z.preprocess((v) => (v == null ? "" : v), z.string().trim().max(40)).transform((v) => v || null);
export const currency = z.enum(CURRENCIES);
export const intRange = (min: number, max: number) => z.coerce.number({ error: "Enter a number" }).int("Enter a whole number").min(min).max(max);

/** Accepts yyyy-mm-dd or yyyy-mm-ddThh:mm (UTC); blank → null. */
export const optDate = z.preprocess((v) => (v == null ? "" : v), z.string().trim()).transform((v, ctx) => {
  if (!v) return null;
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T00:00:00Z` : v.length === 16 ? `${v}:00Z` : v);
  if (Number.isNaN(d.getTime())) {
    ctx.addIssue({ code: "custom", message: "Invalid date" });
    return z.NEVER;
  }
  return d;
});

/** Money as a validated decimal string (converted to Decimal by the caller). */
export const moneyStr = (required = false) =>
  z.preprocess((v) => (v == null ? "" : String(v).replace(/[,\s]/g, "")), z.string()).refine((v) => (!v && !required) || /^\d{1,12}(\.\d{1,2})?$/.test(v), "Enter a valid amount").transform((v) => (v ? v : null));

export const pctStr = z.preprocess((v) => (v == null || v === "" ? "0" : String(v).trim()), z.string()).refine((v) => /^\d{1,3}(\.\d{1,2})?$/.test(v) && Number(v) <= 100, "0–100").transform((v) => v);

export const toDateInput = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "");
export const toDateTimeInput = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 16) : "");

/**
 * Success result that reloads `path` and shows the message as a toast. Used by workflow buttons whose own form
 * disappears after the status changes (so an inline toast would never render).
 */
export const okThen = (path: string, message: string): ActionState => ({ ok: message, redirect: `${path}${path.includes("?") ? "&" : "?"}toast=${encodeURIComponent(message)}` });
