/* Server-only module: email templates for the lead pipeline. */
import { siteConfig } from "@/data/siteConfig";
import { bookCallHref } from "@/lib/calendly";
import { whatsappHref, whatsappLines } from "@/lib/whatsapp";
import type { LeadRecord } from "@/lib/leads/types";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const dash = (s: string) => s || "—";
const LOGO = `${siteConfig.url}/brand/shivacha-logo-original.png`;
const SALES = "sales@shivacha.com";

export function formatDateTime(iso: string) {
  const d = new Date(iso);
  const ist = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(d);
  const utc = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(d);
  return `${ist} IST (${utc} UTC)`;
}

const waDigits = (phone: string) => phone.replace(/\D/g, "");

function button(href: string, label: string, primary = false) {
  const bg = primary ? "#0073cc" : "#ffffff";
  const fg = primary ? "#ffffff" : "#0b1424";
  const border = primary ? "#0073cc" : "#d8e1ec";
  return `<a href="${esc(href)}" style="display:inline-block;margin:0 8px 8px 0;padding:11px 20px;border-radius:999px;background:${bg};color:${fg};border:1px solid ${border};font-weight:600;font-size:14px;text-decoration:none">${esc(label)}</a>`;
}

function shell(preheader: string, inner: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"></head>
<body style="margin:0;padding:0;background:#f1f5fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0b1424">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5fa;padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#ffffff;border:1px solid #e3e9f1;border-radius:16px;overflow:hidden">
<tr><td style="padding:24px 32px;border-bottom:1px solid #eef2f7"><img src="${LOGO}" width="150" alt="Shivacha Technologies" style="display:block;border:0;height:auto"></td></tr>
${inner}
<tr><td style="padding:20px 32px;background:#f7f9fc;border-top:1px solid #eef2f7;font-size:12px;line-height:1.6;color:#5b6678">${esc(siteConfig.name)} · <a href="mailto:${SALES}" style="color:#0068b3;text-decoration:none">${SALES}</a> · ${esc(siteConfig.contact.phone)}<br>${esc(siteConfig.url.replace(/^https?:\/\//, ""))}</td></tr>
</table></td></tr></table></body></html>`;
}

function row(label: string, value: string, html = false) {
  return `<tr><td style="padding:9px 0;border-bottom:1px solid #eef2f7;width:170px;vertical-align:top;font-size:13px;color:#5b6678">${esc(label)}</td><td style="padding:9px 0;border-bottom:1px solid #eef2f7;font-size:14px;color:#0b1424;font-weight:500">${html ? value : esc(dash(value))}</td></tr>`;
}

const scoreColor = { Hot: ["#fde8e8", "#b42318"], Warm: ["#fff4e0", "#9a5b00"], Cold: ["#e6f0fb", "#0068b3"] } as const;

/* ───────── Sales notification → sales@shivacha.com ───────── */

export function salesNotification(lead: LeadRecord, viewUrl?: string) {
  const service = lead.service || (lead.formType === "project" ? "General Inquiry" : formLabel(lead.formType));
  const subject = `New Shivacha Lead — ${service} — ${lead.name}`;
  const submitted = formatDateTime(lead.createdAt);
  const contactHref = `mailto:${lead.email}?subject=${encodeURIComponent(`Your project inquiry — Shivacha Technologies (${lead.id})`)}`;
  const waHref = lead.phone ? `https://wa.me/${waDigits(lead.phone)}` : "";
  const [sBg, sFg] = scoreColor[lead.scoreLabel];

  const text = `New website lead received.

Lead Details
Name: ${dash(lead.name)}
Email: ${dash(lead.email)}
Phone / WhatsApp: ${dash(lead.phone)}
Company: ${dash(lead.company)}
Country: ${dash(lead.country)}
Service: ${dash(service)}
Budget: ${dash(lead.budget)}

Project Description:
${dash(lead.description)}
${Object.keys(lead.extra).length ? `\nAdditional details:\n${Object.entries(lead.extra).map(([k, v]) => `${k}: ${v}`).join("\n")}\n` : ""}
Lead Score: ${lead.score}/100 (${lead.scoreLabel})
Lead Status: New

Source:
${dash(lead.sourcePage)}
Landing page: ${dash(lead.landingPage)}
UTM Source: ${dash(lead.utmSource)}
UTM Medium: ${dash(lead.utmMedium)}
UTM Campaign: ${dash(lead.utmCampaign)}

Submitted:
${submitted}

ACTION:
Contact this lead as soon as possible.
Contact Lead: ${contactHref}
${waHref ? `Open WhatsApp: ${waHref}\n` : ""}${viewUrl ? `View Lead: ${viewUrl}\n` : ""}
Lead ID: ${lead.id} · Follow up by ${formatDateTime(lead.nextFollowUp)}
`;

  const extraRows = Object.entries(lead.extra)
    .map(([k, v]) => row(k, v))
    .join("");
  const html = shell(
    `${lead.name} · ${service} · ${lead.budget || "Budget not given"} · Score ${lead.score}`,
    `<tr><td style="padding:28px 32px 8px">
  <table role="presentation" width="100%"><tr>
    <td style="font-size:12px;font-weight:600;color:#0068b3;letter-spacing:.02em">NEW WEBSITE LEAD RECEIVED</td>
    <td align="right"><span style="display:inline-block;padding:4px 10px;border-radius:999px;background:${sBg};color:${sFg};font-size:12px;font-weight:700">${lead.scoreLabel} · ${lead.score}/100</span></td>
  </tr></table>
  <h1 style="margin:12px 0 4px;font-size:24px;line-height:1.25;color:#0b1424">${esc(lead.name)}</h1>
  <p style="margin:0;font-size:15px;color:#475569">${esc(service)}${lead.company ? ` · ${esc(lead.company)}` : ""}${lead.budget ? ` · ${esc(lead.budget)}` : ""}</p>
</td></tr>
<tr><td style="padding:16px 32px 0">
  <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#0b1424">Lead Details</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    ${row("Name", lead.name)}
    ${row("Email", `<a href="mailto:${esc(lead.email)}" style="color:#0068b3;text-decoration:none">${esc(lead.email)}</a>`, true)}
    ${row("Phone / WhatsApp", lead.phone ? `<a href="tel:${esc(lead.phone.replace(/[^\d+]/g, ""))}" style="color:#0068b3;text-decoration:none">${esc(lead.phone)}</a>` : "—", true)}
    ${row("Company", lead.company)}
    ${row("Country", lead.country)}
    ${row("Service", service)}
    ${row("Budget", lead.budget)}
    ${extraRows}
  </table>
</td></tr>
<tr><td style="padding:20px 32px 0">
  <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#0b1424">Project Description</p>
  <div style="padding:14px 16px;border-radius:12px;background:#f7f9fc;border:1px solid #eef2f7;font-size:14px;line-height:1.6;color:#0b1424;white-space:pre-wrap">${esc(dash(lead.description))}</div>
</td></tr>
<tr><td style="padding:20px 32px 0">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    ${row("Lead Score", `${lead.score}/100 (${lead.scoreLabel})`)}
    ${row("Lead Status", "New")}
    ${row("Source", lead.sourcePage)}
    ${row("Landing page", lead.landingPage)}
    ${row("UTM Source", lead.utmSource)}
    ${row("UTM Medium", lead.utmMedium)}
    ${row("UTM Campaign", lead.utmCampaign)}
    ${row("Submitted", submitted)}
    ${row("Lead ID", lead.id)}
  </table>
</td></tr>
<tr><td style="padding:24px 32px 28px">
  <div style="padding:18px 20px;border-radius:12px;background:#eef6ff;border:1px solid #cfe4fb">
    <p style="margin:0 0 4px;font-size:12px;font-weight:700;color:#0068b3;letter-spacing:.02em">ACTION</p>
    <p style="margin:0 0 14px;font-size:15px;font-weight:600;color:#0b1424">Contact this lead as soon as possible.</p>
    ${button(contactHref, "Contact Lead", true)}${waHref ? button(waHref, "Open WhatsApp") : ""}${viewUrl ? button(viewUrl, "View Lead") : ""}
    <p style="margin:8px 0 0;font-size:12px;color:#475569">Follow up by ${esc(formatDateTime(lead.nextFollowUp))}. A calendar reminder is attached.</p>
  </div>
</td></tr>`,
  );
  return { subject, text, html };
}

/* ───────── Confirmation → visitor ───────── */

export function visitorConfirmation(lead: LeadRecord) {
  const first = lead.name.split(/\s+/)[0] || lead.name;
  const book = bookCallHref(siteConfig.url);
  const waText = `Hi Shivacha, I just sent a project inquiry (ref ${lead.id}).`;
  const wa = whatsappLines.map((l) => ({ label: `WhatsApp ${l.country}`, display: l.display, href: whatsappHref(waText, l.id) }));
  const subject = "We Received Your Project Inquiry — Shivacha Technologies";
  const text = `Hi ${first},

Thank you for contacting Shivacha Technologies.

We've received your project requirements and our team will review them shortly.

If you'd like to speak with our team directly, you can schedule a convenient time here:
Book a Call: ${book}

You can also contact our team on WhatsApp:
${wa.map((w) => `${w.label} (${w.display}): ${w.href}`).join("\n")}

Regards,
Shivacha Technologies
${SALES}

Reference: ${lead.id}
`;
  const html = shell(
    "Thank you for contacting Shivacha Technologies. Our team will review your requirements shortly.",
    `<tr><td style="padding:32px 32px 8px">
  <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#0b1424">Hi ${esc(first)},</h1>
  <p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:#334155">Thank you for contacting Shivacha Technologies.</p>
  <p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:#334155">We've received your project requirements and our team will review them shortly.</p>
  <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#334155">If you'd like to speak with our team directly, you can schedule a convenient time here:</p>
  ${button(book, "Book a Call", true)}
  <p style="margin:18px 0 10px;font-size:15px;line-height:1.7;color:#334155">You can also contact our team on WhatsApp:</p>
  ${wa.map((w) => button(w.href, w.label)).join("")}
</td></tr>
<tr><td style="padding:16px 32px 32px">
  <p style="margin:0;font-size:15px;line-height:1.7;color:#334155">Regards,<br><strong style="color:#0b1424">Shivacha Technologies</strong><br><a href="mailto:${SALES}" style="color:#0068b3;text-decoration:none">${SALES}</a></p>
  <p style="margin:18px 0 0;font-size:12px;color:#5b6678">Reference: ${esc(lead.id)}</p>
</td></tr>`,
  );
  return { subject, text, html };
}

/** Job applications go to HR with a short confirmation to the applicant. */
export function applicantConfirmation(lead: LeadRecord) {
  const first = lead.name.split(/\s+/)[0] || lead.name;
  const subject = "We Received Your Application — Shivacha Technologies";
  const text = `Hi ${first},\n\nThank you for applying to Shivacha Technologies. We review every application and will be in touch if there is a fit.\n\nRegards,\nShivacha Technologies\nhr@shivacha.com\n\nReference: ${lead.id}\n`;
  const html = shell(
    "Thank you for applying to Shivacha Technologies.",
    `<tr><td style="padding:32px"><h1 style="margin:0 0 16px;font-size:22px;color:#0b1424">Hi ${esc(first)},</h1><p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:#334155">Thank you for applying to Shivacha Technologies. We review every application and will be in touch if there is a fit.</p><p style="margin:0;font-size:15px;line-height:1.7;color:#334155">Regards,<br><strong>Shivacha Technologies</strong><br>hr@shivacha.com</p><p style="margin:18px 0 0;font-size:12px;color:#5b6678">Reference: ${esc(lead.id)}</p></td></tr>`,
  );
  return { subject, text, html };
}

/** Calendar reminder (.ics) for the sales follow-up, attached to the notification email. */
export function followUpIcs(lead: LeadRecord) {
  const fmt = (iso: string) => iso.replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const start = fmt(new Date(lead.nextFollowUp).toISOString());
  const end = fmt(new Date(new Date(lead.nextFollowUp).getTime() + 15 * 60_000).toISOString());
  const icsText = (s: string) => s.replace(/\\/g, "\\\\").replace(/[,;]/g, (m) => `\\${m}`).replace(/\r?\n/g, "\\n");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Shivacha Technologies//Lead follow-up//EN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${lead.id}@shivacha.com`,
    `DTSTAMP:${fmt(new Date().toISOString())}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${icsText(`Follow up: ${lead.name} (${lead.service || "Lead"})`)}`,
    `DESCRIPTION:${icsText(`Lead ${lead.id}\nEmail: ${lead.email}\nPhone: ${lead.phone || "—"}\nScore: ${lead.score}/100 (${lead.scoreLabel})`)}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT10M",
    "ACTION:DISPLAY",
    "DESCRIPTION:Lead follow-up",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

export function formLabel(type: string) {
  return (
    { project: "Project Inquiry", contact: "Contact", demo: "Demo Request", meeting: "Meeting Request", hire: "Hire Developers", resource: "Resource Request", newsletter: "Newsletter", job: "Job Application" } as Record<string, string>
  )[type] ?? "Website Lead";
}
