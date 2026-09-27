"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { audit } from "@/lib/audit";
import { authorizeAccess } from "@/lib/os/guard";
import { fail, formObject, moneyStr, okThen, optDate, optId, optText, reqText, currency, UserError, type ActionState } from "@/lib/os/action";
import { nextNumber } from "@/lib/os/numbers";
import { logActivity } from "@/lib/os/activity";
import { snapshot } from "./lines";

const F = "PROPOSALS" as const;
const schema = z.object({ title: reqText(200), clientId: z.string().min(1, "Choose a client").max(40), dealId: optId, proposalId: optId, value: moneyStr(true), currency, startDate: optDate, endDate: optDate, renewalDate: optDate, terms: optText(50000) });

export async function createContractAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorizeAccess("contracts:manage", F);
    const d = schema.parse(formObject(form));
    if (!(await db.client.findFirst({ where: { id: d.clientId, deletedAt: null } }))) throw new UserError("Client not found.");
    if (d.startDate && d.endDate && d.endDate < d.startDate) throw new UserError("The end date is before the start date.");
    const c = await db.$transaction(async (tx) => {
      const number = await nextNumber("contract", tx);
      const created = await tx.contract.create({ data: { ...d, value: d.value!, number, createdById: user.id } });
      await logActivity({ type: "CREATED", summary: `Contract ${number} created`, actorId: user.id, contractId: created.id, clientId: d.clientId, dealId: d.dealId }, tx);
      return created;
    });
    await audit({ userId: user.id, action: "contract.created", entity: "Contract", entityId: c.id });
    return { ok: `Contract ${c.number} created.`, redirect: `/admin/contracts/${c.id}` };
  } catch (e) {
    return fail(e, "contracts");
  }
}

export async function updateContractAction(id: string, _: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorizeAccess("contracts:manage", F);
    const c = await db.contract.findUnique({ where: { id } });
    if (!c || c.deletedAt) return { error: "Contract not found." };
    if (c.status !== "DRAFT") return { error: "Only draft contracts can be edited. Create a new version first." };
    const d = schema.parse(formObject(form));
    if (d.startDate && d.endDate && d.endDate < d.startDate) return { error: "The end date is before the start date." };
    await db.$transaction(async (tx) => {
      await tx.contract.update({ where: { id }, data: { ...d, value: d.value! } });
      await logActivity({ type: "UPDATED", actorId: user.id, contractId: id }, tx);
    });
    revalidatePath(`/admin/contracts/${id}`);
    return { ok: "Contract saved." };
  } catch (e) {
    return fail(e, "contracts");
  }
}

const NEXT: Record<string, string[]> = { DRAFT: ["SENT"], SENT: ["DRAFT"], SIGNED: ["ACTIVE", "TERMINATED"], ACTIVE: ["EXPIRED", "TERMINATED"], EXPIRED: [], TERMINATED: [] };

/** Status changes other than SIGNED (which needs evidence — see recordSignatureAction). */
export async function setContractStatusAction(id: string, status: "SENT" | "DRAFT" | "ACTIVE" | "EXPIRED" | "TERMINATED"): Promise<ActionState> {
  try {
    const user = await authorizeAccess("contracts:manage", F);
    const c = await db.contract.findUnique({ where: { id } });
    if (!c || c.deletedAt) return { error: "Contract not found." };
    if (!NEXT[c.status]?.includes(status)) return { error: `A ${c.status.toLowerCase()} contract cannot become ${status.toLowerCase()}.` };
    const revise = c.status === "SENT" && status === "DRAFT";
    await db.$transaction(async (tx) => {
      if (status === "SENT" || revise) await snapshot("CONTRACT", id, c.version, c, user.id, status === "SENT" ? "Sent for signature" : "Withdrawn for changes", tx);
      await tx.contract.update({ where: { id }, data: { status, ...(status === "SENT" && { signatureStatus: "PENDING" }), ...(revise && { version: c.version + 1, signatureStatus: "NOT_REQUESTED" }) } });
      await logActivity({ type: "STATUS_CHANGED", summary: `${c.status} → ${status}${revise ? ` (version ${c.version + 1})` : ""}`, actorId: user.id, contractId: id, clientId: c.clientId }, tx);
    });
    await audit({ userId: user.id, action: `contract.${status.toLowerCase()}`, entity: "Contract", entityId: id });
    return okThen(`/admin/contracts/${id}`, `Contract ${status === "DRAFT" ? "returned to draft" : `marked ${status.toLowerCase()}`}.`);
  } catch (e) {
    return fail(e, "contracts");
  }
}

/**
 * Records a signature from a countersigned document that has been uploaded to this contract.
 * Evidence (document id, who recorded it, when) is stored with the signature.
 */
export async function recordSignatureAction(id: string, _: ActionState, form: FormData): Promise<ActionState> {
  try {
    const user = await authorizeAccess("contracts:manage", F);
    const d = z.object({ signerName: reqText(200), signerEmail: z.string().trim().email("Invalid email").max(160), signedAt: optDate, documentId: z.string().min(1, "Choose the signed document").max(40) }).parse(formObject(form));
    const c = await db.contract.findUnique({ where: { id } });
    if (!c || c.deletedAt) return { error: "Contract not found." };
    if (c.status !== "SENT") return { error: "Send the contract for signature first." };
    const doc = await db.document.findFirst({ where: { id: d.documentId, contractId: id, deletedAt: null } });
    if (!doc) return { error: "Upload the countersigned document to this contract first, then select it." };
    const signedAt = d.signedAt ?? new Date();
    await db.$transaction(async (tx) => {
      await tx.contractSignature.create({ data: { contractId: id, signerName: d.signerName, signerEmail: d.signerEmail, status: "SIGNED", signedAt, provider: "manual-upload", evidence: { documentId: doc.id, documentName: doc.name, recordedById: user.id, recordedAt: new Date().toISOString() } } });
      await tx.contract.update({ where: { id }, data: { status: "SIGNED", signatureStatus: "SIGNED", signedAt } });
      await snapshot("CONTRACT", id, c.version, { ...c, status: "SIGNED" }, user.id, `Signed by ${d.signerName} (document ${doc.name})`, tx);
      await logActivity({ type: "SIGNED", summary: `Signed by ${d.signerName} — countersigned copy "${doc.name}" recorded`, actorId: user.id, contractId: id, clientId: c.clientId, dealId: c.dealId }, tx);
    });
    await audit({ userId: user.id, action: "contract.signed", entity: "Contract", entityId: id, metadata: { signer: d.signerEmail, documentId: doc.id } });
    return okThen(`/admin/contracts/${id}`, "Signature recorded.");
  } catch (e) {
    return fail(e, "contracts");
  }
}

export async function archiveContractAction(id: string) {
  const user = await authorizeAccess("contracts:manage", F);
  await db.contract.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit({ userId: user.id, action: "contract.archived", entity: "Contract", entityId: id });
  revalidatePath("/admin/contracts");
}
