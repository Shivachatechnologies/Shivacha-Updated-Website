import { createHash, randomBytes } from "node:crypto";

/** 256-bit random token for cookies and reset links. */
export const newToken = () => randomBytes(32).toString("base64url");
/** Only the hash of a token is stored, so a database leak does not expose live sessions. */
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
