import { db } from "@/lib/db/client";
import { verifyStripeSignature } from "@/lib/payments/signature";
import { notify } from "@/lib/os/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Calendly webhook (invitee.created / invitee.canceled). Signed with CALENDLY_WEBHOOK_SIGNING_KEY using the
 * "t=…,v1=…" HMAC-SHA256 scheme. Bookings are attached to the lead with the same email (never creating fake leads).
 */
export async function POST(req: Request) {
  const key = process.env.CALENDLY_WEBHOOK_SIGNING_KEY;
  if (!key) return new Response("Not configured", { status: 503 });
  const raw = await req.text();
  if (!verifyStripeSignature(raw, req.headers.get("calendly-webhook-signature"), key, Date.now(), 180)) return new Response("Invalid signature", { status: 400 });
  const evt = JSON.parse(raw) as { event: string; payload: { email?: string; name?: string; uri?: string; cancel_url?: string; scheduled_event?: { name?: string; start_time?: string; end_time?: string; location?: { join_url?: string } } } };
  const p = evt.payload;
  const ref = p.uri ?? "";
  if (!ref) return Response.json({ ignored: true });
  if (evt.event === "invitee.canceled") {
    await db.communication.updateMany({ where: { provider: "calendly", providerRef: ref }, data: { status: "CANCELLED" } });
    return Response.json({ ok: true });
  }
  if (evt.event !== "invitee.created") return Response.json({ ignored: true });
  if (await db.communication.findFirst({ where: { provider: "calendly", providerRef: ref } })) return Response.json({ duplicate: true });
  const lead = p.email ? await db.lead.findFirst({ where: { email: { equals: p.email, mode: "insensitive" }, archivedAt: null }, orderBy: { createdAt: "desc" }, select: { id: true, assignedToId: true, name: true } }) : null;
  const start = p.scheduled_event?.start_time ? new Date(p.scheduled_event.start_time) : new Date();
  const end = p.scheduled_event?.end_time ? new Date(p.scheduled_event.end_time) : null;
  await db.communication.create({ data: { channel: "MEETING", direction: "INBOUND", status: "SCHEDULED", provider: "calendly", providerRef: ref, subject: p.scheduled_event?.name ?? "Calendly meeting", body: `Booked by ${p.name ?? p.email ?? "invitee"} via Calendly.`, fromAddress: p.email, scheduledAt: start, occurredAt: start, durationMin: end ? Math.round((end.getTime() - start.getTime()) / 60000) : null, meetingUrl: p.scheduled_event?.location?.join_url?.startsWith("https://") ? p.scheduled_event.location.join_url : null, leadId: lead?.id } });
  if (lead) {
    await db.lead.update({ where: { id: lead.id }, data: { status: "MEETING" } }).catch(() => {});
    await db.leadActivity.create({ data: { leadId: lead.id, type: "MEETING_SCHEDULED", data: { via: "calendly", start: start.toISOString() } } });
  }
  await notify({ type: "followup.due", title: `Calendly booking: ${p.name ?? p.email ?? "new meeting"}`, body: start.toISOString().slice(0, 16).replace("T", " ") + " UTC", href: lead ? `/admin/leads/${lead.id}` : "/admin/communication/meetings", userIds: [lead?.assignedToId], permission: lead?.assignedToId ? undefined : "leads:assign" });
  return Response.json({ ok: true, matchedLead: !!lead });
}
