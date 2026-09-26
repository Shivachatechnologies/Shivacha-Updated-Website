import { randomBytes } from "node:crypto";

const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // no 0/O/1/I

/** Human-friendly, unguessable lead ID, e.g. SHV-260926-7K4QX9. */
export function newLeadId(now = new Date()) {
  const date = now.toISOString().slice(2, 10).replace(/-/g, "");
  const bytes = randomBytes(6);
  const suffix = [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join("");
  return `SHV-${date}-${suffix}`;
}
