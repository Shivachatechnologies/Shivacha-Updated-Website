import "server-only";
import { db } from "@/lib/db/client";

/**
 * Factual performance signals for one employee over a period, counted from real records. These are inputs to a human
 * review workflow; nothing here scores, ranks or decides anything about the person.
 */
export async function employeeMetrics(employee: { id: string; userId: string | null }, from: Date, to = new Date()) {
  const uid = employee.userId;
  const range = { gte: from, lte: to };
  const [days, tasksDone, tasksOpen, tasksOverdue, projectsDone, dealsWon, ticketsResolved, proposals, minutes] = await Promise.all([
    db.attendanceDay.findMany({ where: { employeeId: employee.id, date: range }, select: { status: true, checkInAt: true, lateMinutes: true, workMinutes: true, earlyCheckout: true } }),
    uid ? db.task.count({ where: { assigneeId: uid, status: "DONE", completedAt: range } }) : 0,
    uid ? db.task.count({ where: { assigneeId: uid, status: { not: "DONE" } } }) : 0,
    uid ? db.task.count({ where: { assigneeId: uid, status: { not: "DONE" }, dueDate: { lt: to } } }) : 0,
    uid ? db.project.count({ where: { managerId: uid, status: "COMPLETED", completedAt: range } }) : 0,
    uid ? db.deal.groupBy({ by: ["currency"], where: { ownerId: uid, stage: "WON", wonAt: range, deletedAt: null }, _count: { _all: true }, _sum: { value: true } }) : [],
    uid ? db.ticket.count({ where: { assigneeId: uid, resolvedAt: range } }) : 0,
    uid ? db.proposal.count({ where: { createdById: uid, createdAt: range } }) : 0,
    db.timesheet.aggregate({ where: { employeeId: employee.id, date: range, status: { in: ["SUBMITTED", "APPROVED"] } }, _sum: { minutes: true } }),
  ]);
  const present = days.filter((d) => d.checkInAt).length;
  const late = days.filter((d) => d.lateMinutes > 0).length;
  return {
    attendance: { present, absent: days.filter((d) => d.status === "ABSENT").length, leave: days.filter((d) => d.status === "ON_LEAVE").length, late, early: days.filter((d) => d.earlyCheckout).length, avgWorkMinutes: present ? Math.round(days.reduce((a, d) => a + d.workMinutes, 0) / present) : null, punctualityPct: present ? Math.round(((present - late) / present) * 100) : null },
    tasks: { done: tasksDone, open: tasksOpen, overdue: tasksOverdue },
    projectsCompleted: projectsDone,
    sales: { won: dealsWon.map((d) => ({ currency: d.currency, count: d._count._all, value: d._sum.value?.toString() ?? "0" })) },
    support: { resolved: ticketsResolved },
    proposalsCreated: proposals,
    loggedMinutes: minutes._sum.minutes ?? 0,
    linked: !!uid,
  };
}
