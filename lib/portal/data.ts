import "server-only";
import { db } from "@/lib/db/client";
import type { PortalSessionUser } from "./session";

/**
 * Tenant-scoped data access for the client portal. EVERY query is filtered by `u.clientId`, taken from the
 * server-side portal session — never from URL parameters or form input. Detail lookups use
 * findFirst({ id, clientId }) so another client's record id simply resolves to "not found".
 * Drafts, internal notes, internal documents and unconfirmed payments are never exposed.
 */
const VISIBLE_PROPOSAL = ["SENT", "VIEWED", "ACCEPTED", "REJECTED", "EXPIRED"] as const;
const VISIBLE_INVOICE = ["ISSUED", "PARTIALLY_PAID", "PAID", "VOID"] as const;
const VISIBLE_CONTRACT = ["SENT", "SIGNED", "ACTIVE", "EXPIRED", "TERMINATED"] as const;
const VISIBLE_PAYMENT = ["CONFIRMED", "REFUNDED", "PARTIALLY_REFUNDED"] as const;

export const portalProjects = (u: PortalSessionUser) =>
  db.project.findMany({ where: { clientId: u.clientId, deletedAt: null }, orderBy: { createdAt: "desc" }, select: { id: true, number: true, name: true, status: true, progress: true, startDate: true, targetDate: true, health: true } });

export const portalProject = (u: PortalSessionUser, id: string) =>
  db.project.findFirst({
    where: { id, clientId: u.clientId, deletedAt: null },
    select: {
      id: true, number: true, name: true, description: true, status: true, progress: true, health: true, startDate: true, targetDate: true, completedAt: true,
      manager: { select: { name: true } },
      milestones: { where: { clientVisible: true }, orderBy: [{ sortOrder: "asc" }, { dueDate: "asc" }], select: { id: true, name: true, dueDate: true, status: true, completedAt: true } },
      updates: { where: { visibility: "CLIENT" }, orderBy: { createdAt: "desc" }, take: 30, select: { id: true, body: true, health: true, createdAt: true, author: { select: { name: true } } } },
      changeRequests: { orderBy: { createdAt: "desc" }, take: 30, select: { id: true, title: true, status: true, impactCost: true, impactDays: true, createdAt: true, fromClient: true } },
      documents: { where: { visibility: "CLIENT", deletedAt: null }, orderBy: { createdAt: "desc" }, select: { id: true, name: true, size: true, createdAt: true } },
      _count: { select: { tasks: true } },
    },
  });

export const portalProposals = (u: PortalSessionUser) =>
  db.proposal.findMany({ where: { clientId: u.clientId, deletedAt: null, status: { in: [...VISIBLE_PROPOSAL] } }, orderBy: { sentAt: "desc" }, select: { id: true, number: true, title: true, status: true, total: true, currency: true, validUntil: true, sentAt: true, version: true } });

export const portalProposal = (u: PortalSessionUser, id: string) =>
  db.proposal.findFirst({ where: { id, clientId: u.clientId, deletedAt: null, status: { in: [...VISIBLE_PROPOSAL] } }, include: { items: { orderBy: { sortOrder: "asc" } } } });

export const portalContracts = (u: PortalSessionUser) =>
  db.contract.findMany({ where: { clientId: u.clientId, deletedAt: null, status: { in: [...VISIBLE_CONTRACT] } }, orderBy: { createdAt: "desc" }, select: { id: true, number: true, title: true, status: true, signatureStatus: true, value: true, currency: true, startDate: true, endDate: true, renewalDate: true } });

export const portalContract = (u: PortalSessionUser, id: string) =>
  db.contract.findFirst({ where: { id, clientId: u.clientId, deletedAt: null, status: { in: [...VISIBLE_CONTRACT] } }, include: { signatures: { select: { signerName: true, status: true, signedAt: true } }, documents: { where: { visibility: "CLIENT", deletedAt: null }, select: { id: true, name: true } } } });

export const portalInvoices = (u: PortalSessionUser) =>
  db.invoice.findMany({ where: { clientId: u.clientId, status: { in: [...VISIBLE_INVOICE] } }, orderBy: { issueDate: "desc" }, select: { id: true, number: true, status: true, total: true, balanceDue: true, currency: true, issueDate: true, dueDate: true, paymentLinkUrl: true } });

export const portalInvoice = (u: PortalSessionUser, id: string) =>
  db.invoice.findFirst({ where: { id, clientId: u.clientId, status: { in: [...VISIBLE_INVOICE] } }, include: { items: { orderBy: { sortOrder: "asc" } }, allocations: { where: { payment: { status: { in: [...VISIBLE_PAYMENT] } } }, include: { payment: { select: { number: true, confirmedAt: true, method: true } } } }, client: true } });

export const portalPayments = (u: PortalSessionUser) =>
  db.payment.findMany({ where: { clientId: u.clientId, status: { in: [...VISIBLE_PAYMENT] } }, orderBy: { confirmedAt: "desc" }, select: { id: true, number: true, amount: true, refundedAmount: true, currency: true, method: true, status: true, confirmedAt: true, reference: true, allocations: { select: { amount: true, invoice: { select: { id: true, number: true } } } } } });

export const portalDocuments = (u: PortalSessionUser) =>
  db.document.findMany({ where: { clientId: u.clientId, visibility: "CLIENT", deletedAt: null }, orderBy: { createdAt: "desc" }, select: { id: true, name: true, size: true, mimeType: true, createdAt: true, project: { select: { name: true } }, contract: { select: { number: true } } } });

export const portalDocument = (u: PortalSessionUser, id: string) => db.document.findFirst({ where: { id, clientId: u.clientId, visibility: "CLIENT", deletedAt: null } });

export const portalTickets = (u: PortalSessionUser) =>
  db.ticket.findMany({ where: { clientId: u.clientId }, orderBy: { updatedAt: "desc" }, select: { id: true, number: true, subject: true, status: true, priority: true, category: true, createdAt: true, updatedAt: true } });

export const portalTicket = (u: PortalSessionUser, id: string) =>
  db.ticket.findFirst({
    where: { id, clientId: u.clientId },
    select: {
      id: true, number: true, subject: true, description: true, status: true, priority: true, category: true, createdAt: true, resolvedAt: true,
      // Internal notes are never selected for the portal.
      messages: { where: { internal: false }, orderBy: { createdAt: "asc" }, select: { id: true, body: true, createdAt: true, author: { select: { name: true } }, portalUser: { select: { name: true } } } },
      documents: { where: { visibility: "CLIENT", deletedAt: null }, select: { id: true, name: true } },
    },
  });

export const portalMessages = (u: PortalSessionUser) =>
  db.communication.findMany({ where: { clientId: u.clientId, provider: "portal" }, orderBy: { occurredAt: "desc" }, take: 100, select: { id: true, body: true, direction: true, occurredAt: true, subject: true, user: { select: { name: true } }, meta: true } });

export async function portalDashboard(u: PortalSessionUser) {
  const [projects, invoices, tickets, proposals, messages] = await Promise.all([
    db.project.findMany({ where: { clientId: u.clientId, deletedAt: null, status: { in: ["PLANNED", "ACTIVE", "ON_HOLD"] } }, orderBy: { targetDate: "asc" }, take: 5, select: { id: true, name: true, status: true, progress: true, targetDate: true } }),
    db.invoice.findMany({ where: { clientId: u.clientId, status: { in: ["ISSUED", "PARTIALLY_PAID"] } }, orderBy: { dueDate: "asc" }, take: 10, select: { id: true, number: true, balanceDue: true, currency: true, dueDate: true } }),
    db.ticket.count({ where: { clientId: u.clientId, status: { in: ["OPEN", "IN_PROGRESS", "WAITING_FOR_CLIENT"] } } }),
    db.proposal.findMany({ where: { clientId: u.clientId, deletedAt: null, status: { in: ["SENT", "VIEWED"] } }, take: 5, select: { id: true, number: true, title: true, validUntil: true } }),
    db.communication.count({ where: { clientId: u.clientId, provider: "portal", direction: "OUTBOUND", occurredAt: { gte: new Date(Date.now() - 14 * 86400_000) } } }),
  ]);
  return { projects, invoices, tickets, proposals, messages };
}
