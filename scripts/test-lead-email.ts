/**
 * Sends a sample lead notification and confirmation using the configured email settings.
 *   SMTP_USER=sales@shivacha.com SMTP_PASS=... npm run leads:test-email -- you@example.com
 */
import { mailMode, sendMail } from "../lib/email/mailer";
import { salesNotification, visitorConfirmation, followUpIcs } from "../lib/email/templates";
import { buildLead, salesInbox } from "../lib/leads/pipeline";

async function main() {
  const visitor = process.argv[2] || salesInbox();
  console.log(`Mail mode: ${mailMode()}`);
  const lead = buildLead(
    "project",
    { name: "Test Lead", email: visitor, phone: "+91 81711 33917", company: "Example Ltd", service: "FinTech Development", budget: "$25K–$50K", message: "This is a test lead from scripts/test-lead-email.ts.", source: "/start-a-project", utm_source: "test", utm_medium: "script", utm_campaign: "setup" },
    [],
    { country: "India", referer: "" },
  );
  const n = salesNotification(lead);
  console.log("Sales:", await sendMail({ to: salesInbox(), replyTo: visitor, ...n, attachments: [{ filename: "follow-up.ics", content: followUpIcs(lead), contentType: "text/calendar" }] }));
  const c = visitorConfirmation(lead);
  console.log("Confirmation:", await sendMail({ to: visitor, replyTo: salesInbox(), ...c }));
}

main();
