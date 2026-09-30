import "server-only";
import { db } from "@/lib/db/client";
import { ROLES, can, type Permission, type RoleName } from "@/lib/auth/permissions";
import { sendMail } from "@/lib/email/mailer";
import { siteConfig } from "@/data/siteConfig";

export const NOTIFICATION_TYPES = {
  "lead.new": "New lead",
  "lead.assigned": "Lead assigned to you",
  "followup.due": "Follow-up due",
  "proposal.viewed": "Proposal viewed",
  "proposal.expiring": "Proposal expiring",
  "proposal.review": "Proposal awaiting review",
  "deal.won": "Deal won",
  "invoice.overdue": "Invoice overdue",
  "payment.received": "Payment received",
  "ticket.assigned": "Ticket assigned",
  "ticket.created": "New support ticket",
  "milestone.due": "Milestone due",
  "task.assigned": "Task assigned",
  "automation.failed": "Automation failed",
  "security.alert": "Security alert",
  "ai.approval": "AI approval required",
  "ai.briefing": "CEO briefing ready",
  "ai.task": "AI employee task update",
  "leave.requested": "Leave request awaiting approval",
  "leave.decided": "Leave request decided",
  "timesheet.decided": "Timesheet decided",
  "review.stage": "Performance review needs your input",
  "attendance.exception": "Attendance exception",
  "announcement": "Announcement",
  "visitor.alert": "Website visitor alert",
  "growth.salesReady": "Sales-ready lead (growth qualification)",
  "ai.objective": "AI company objective update",
  "ai.escalation": "AI employee escalation or blocker",
} as const;
export type NotificationType = keyof typeof NOTIFICATION_TYPES;

export interface NotifyInput {
  type: NotificationType;
  title: string;
  body?: string;
  href?: string;
  entity?: string;
  entityId?: string;
  /** Explicit recipients… */
  userIds?: (string | null | undefined)[];
  /** …and/or every active user holding this permission. */
  permission?: Permission;
  /** Never notify the person who caused the event. */
  exceptUserId?: string | null;
}

export const rolesWith = (p: Permission): RoleName[] => ROLES.filter((r) => can(r, p));

/**
 * In-app notifications (email only for users who opted in and when mail is configured).
 * Never throws: a notification failure must not break the business action that triggered it.
 */
export async function notify(n: NotifyInput): Promise<number> {
  try {
    const ids = new Set(n.userIds?.filter((x): x is string => !!x));
    if (n.permission) {
      const users = await db.user.findMany({ where: { active: true, role: { in: rolesWith(n.permission) } }, select: { id: true } });
      for (const u of users) ids.add(u.id);
    }
    if (n.exceptUserId) ids.delete(n.exceptUserId);
    if (!ids.size) return 0;
    const prefs = await db.notificationPreference.findMany({ where: { userId: { in: [...ids] }, type: n.type } });
    const muted = new Set(prefs.filter((p) => !p.inApp).map((p) => p.userId));
    const emailTo = new Set(prefs.filter((p) => p.email).map((p) => p.userId));
    const inApp = [...ids].filter((id) => !muted.has(id));
    if (inApp.length)
      await db.notification.createMany({ data: inApp.map((userId) => ({ userId, type: n.type, title: n.title.slice(0, 200), body: n.body?.slice(0, 1000), href: n.href, entity: n.entity, entityId: n.entityId })) });
    if (emailTo.size) {
      const users = await db.user.findMany({ where: { id: { in: [...emailTo] }, active: true }, select: { email: true } });
      const link = n.href ? `${siteConfig.url}${n.href}` : `${siteConfig.url}/admin/notifications`;
      await Promise.all(users.map((u) => sendMail({ to: u.email, subject: `[Shivacha OS] ${n.title}`, text: `${n.title}\n\n${n.body ?? ""}\n\n${link}`, html: `<p><strong>${esc(n.title)}</strong></p><p>${esc(n.body ?? "")}</p><p><a href="${esc(link)}">Open in Shivacha OS</a></p>` }).catch(() => null)));
    }
    return inApp.length;
  } catch (e) {
    console.error("[notify] failed", n.type, (e as Error).message);
    return 0;
  }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
