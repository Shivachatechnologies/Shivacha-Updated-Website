import "server-only";
import { db } from "@/lib/db/client";
import { decryptSecret, encryptionConfigured, encryptSecret } from "@/lib/auth/totp";
import { maskHint, VAULT_NAMES } from "./catalog";

/**
 * Server-side credential vault for the API & Integrations Center.
 * - Values are AES-256-GCM encrypted with APP_ENCRYPTION_KEY (same helper as 2FA secrets); without that key nothing
 *   can be stored.
 * - Environment variables always win: an existing production configuration is never overridden.
 * - Decrypted values live only in this process's memory for a short time, are never logged and never returned to the
 *   browser (the UI only ever sees `hint`).
 */

let cache = new Map<string, string>();
let loadedAt = 0;
const TTL = 60_000;

const envOf = (name: string) => (process.env[name] ?? "").trim();

/** Credential value: environment first, then the vault (after hydrateVault). */
export function secretValue(name: string): string {
  return envOf(name) || cache.get(name) || "";
}

/** Where a credential comes from (for status display). */
export function secretSource(name: string): "ENV" | "VAULT" | null {
  return envOf(name) ? "ENV" : cache.get(name) ? "VAULT" : null;
}

/** Loads vault values into memory (at most once a minute unless forced). Never throws. */
export async function hydrateVault(force = false) {
  if (!force && Date.now() - loadedAt < TTL) return;
  loadedAt = Date.now();
  if (!process.env.DATABASE_URL || !encryptionConfigured()) {
    cache = new Map();
    return;
  }
  try {
    const rows = await db.integrationSecret.findMany({ select: { name: true, valueEncrypted: true } });
    const next = new Map<string, string>();
    for (const r of rows) {
      if (!VAULT_NAMES.has(r.name)) continue;
      try {
        next.set(r.name, decryptSecret(r.valueEncrypted));
      } catch {
        console.error("[vault] a stored credential could not be decrypted (APP_ENCRYPTION_KEY changed?)", r.name);
      }
    }
    cache = next;
  } catch (e) {
    console.error("[vault] load failed", (e as Error).message);
  }
}

export class VaultError extends Error {}

export async function storeSecret(name: string, provider: string, value: string, userId: string) {
  if (!VAULT_NAMES.has(name)) throw new VaultError(`${name} cannot be stored in the vault.`);
  if (!encryptionConfigured()) throw new VaultError("APP_ENCRYPTION_KEY (32+ characters) is not configured, so credentials cannot be stored securely.");
  const v = value.trim();
  if (!v || v.length > 4000 || /[\r\n]/.test(v)) throw new VaultError("Enter a single-line value.");
  await db.integrationSecret.upsert({ where: { name }, update: { valueEncrypted: encryptSecret(v), hint: maskHint(v), provider, updatedById: userId }, create: { name, provider, valueEncrypted: encryptSecret(v), hint: maskHint(v), updatedById: userId } });
  await hydrateVault(true);
}

export async function removeSecrets(names: string[]) {
  await db.integrationSecret.deleteMany({ where: { name: { in: names.filter((n) => VAULT_NAMES.has(n)) } } });
  await hydrateVault(true);
}

/** Stored credential metadata for the UI (never the value). */
export async function vaultEntries() {
  if (!process.env.DATABASE_URL) return [];
  return db.integrationSecret.findMany({ select: { name: true, provider: true, hint: true, updatedAt: true, updatedById: true } });
}
