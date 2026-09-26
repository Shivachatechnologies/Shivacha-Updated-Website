/* Server-only module: imported by app/api/lead only. Never import from client components. */
import { chmod, mkdir, appendFile } from "node:fs/promises";
import path from "node:path";
import { createHmac } from "node:crypto";
import { getAccessToken, serviceAccountConfigured } from "@/lib/google/serviceAccount";
import { LEAD_COLUMNS, safeCell } from "./columns";
import type { LeadRecord } from "./types";

/**
 * Lead database adapters. Configure with LEAD_STORE:
 *   "sheets" – Google Sheet in your Google Workspace (recommended; sales edits status/owner/notes there)
 *   "file"   – append-only JSON Lines file on the server (self-hosted / VPS)
 *   "none"   – do not store (email only)
 * Default: "sheets" when GOOGLE_SHEETS_LEADS_ID is set, otherwise "file".
 * CRM_WEBHOOK_URL, when set, additionally receives every lead (HMAC-signed).
 */

export interface StoreResult {
  stored: boolean;
  driver: string;
  viewUrl?: string;
  error?: string;
}

const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
export const SHEET_TAB = process.env.GOOGLE_SHEETS_LEADS_TAB || "Leads";
let sheetGid: number | undefined;

export function storeDriver() {
  const explicit = process.env.LEAD_STORE;
  if (explicit === "sheets" || explicit === "file" || explicit === "none") return explicit;
  return process.env.GOOGLE_SHEETS_LEADS_ID ? "sheets" : "file";
}

async function sheetsFetch(url: string, init: RequestInit = {}) {
  const token = await getAccessToken([SHEETS_SCOPE]);
  const res = await fetch(url, { ...init, headers: { ...init.headers, authorization: `Bearer ${token}`, "content-type": "application/json" }, signal: AbortSignal.timeout(10_000) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Sheets API ${res.status}: ${JSON.stringify(data).slice(0, 200)}`);
  return data;
}

async function saveToSheet(lead: LeadRecord): Promise<StoreResult> {
  const id = process.env.GOOGLE_SHEETS_LEADS_ID;
  if (!id || !serviceAccountConfigured()) return { stored: false, driver: "sheets", error: "Google Sheets is not configured" };
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}`;
  const row = LEAD_COLUMNS.map((c) => safeCell(c.value(lead)));
  const range = encodeURIComponent(`${SHEET_TAB}!A1`);
  // RAW: values are stored as typed text and never evaluated as formulas.
  const data = (await sheetsFetch(`${base}/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
    method: "POST",
    body: JSON.stringify({ values: [row] }),
  })) as { updates?: { updatedRange?: string } };
  const rowNum = data.updates?.updatedRange?.match(/![A-Z]+(\d+)/)?.[1];
  if (sheetGid === undefined) {
    const meta = (await sheetsFetch(`${base}?fields=sheets.properties(sheetId,title)`).catch(() => ({}))) as { sheets?: { properties: { sheetId: number; title: string } }[] };
    sheetGid = meta.sheets?.find((s) => s.properties.title === SHEET_TAB)?.properties.sheetId;
  }
  const viewUrl = `https://docs.google.com/spreadsheets/d/${id}/edit#gid=${sheetGid ?? 0}${rowNum ? `&range=A${rowNum}` : ""}`;
  return { stored: true, driver: "sheets", viewUrl };
}

async function saveToFile(lead: LeadRecord): Promise<StoreResult> {
  const file = process.env.LEADS_FILE || path.join(process.cwd(), ".data", "leads.jsonl");
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  await appendFile(file, JSON.stringify({ ...lead, attachments: lead.attachments.map(({ name, type, size }) => ({ name, type, size })) }) + "\n", { mode: 0o600 });
  await chmod(file, 0o600).catch(() => {});
  return { stored: true, driver: "file" };
}

export async function saveLead(lead: LeadRecord): Promise<StoreResult> {
  const driver = storeDriver();
  try {
    if (driver === "sheets") return await saveToSheet(lead);
    if (driver === "file") return await saveToFile(lead);
    return { stored: false, driver: "none" };
  } catch (e) {
    return { stored: false, driver, error: (e as Error).message };
  }
}

/** Optional: forward the lead to a CRM / automation webhook, signed with HMAC-SHA256. */
export async function forwardToWebhook(lead: LeadRecord) {
  const url = process.env.CRM_WEBHOOK_URL;
  if (!url) return;
  const body = JSON.stringify({ type: lead.formType, submittedAt: lead.createdAt, lead });
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (process.env.CRM_WEBHOOK_SECRET) headers["x-shivacha-signature"] = createHmac("sha256", process.env.CRM_WEBHOOK_SECRET).update(body).digest("hex");
  const res = await fetch(url, { method: "POST", headers, body, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Webhook responded ${res.status}`);
}
