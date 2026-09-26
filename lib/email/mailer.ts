/* Server-only module: imported by app/api/lead only. Never import from client components. */
import nodemailer, { type Transporter } from "nodemailer";

/**
 * Google Workspace email delivery through sales@shivacha.com. Two modes (server env only):
 *
 *  1. SMTP with an App Password (simplest):
 *       SMTP_USER=sales@shivacha.com  SMTP_PASS=<16-char app password>
 *       (SMTP_HOST defaults to smtp.gmail.com, SMTP_PORT to 465)
 *  2. Gmail OAuth2 (no password stored):
 *       GMAIL_OAUTH_CLIENT_ID, GMAIL_OAUTH_CLIENT_SECRET, GMAIL_OAUTH_REFRESH_TOKEN, GMAIL_USER=sales@shivacha.com
 */

let transporter: Transporter | null | undefined;

export function mailMode() {
  if (process.env.GMAIL_OAUTH_REFRESH_TOKEN && process.env.GMAIL_OAUTH_CLIENT_ID && process.env.GMAIL_OAUTH_CLIENT_SECRET) return "gmail-oauth2";
  if (process.env.SMTP_USER && process.env.SMTP_PASS) return "smtp";
  return "none";
}

function getTransporter() {
  if (transporter !== undefined) return transporter;
  const mode = mailMode();
  const common = { connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 15_000 };
  if (mode === "gmail-oauth2") {
    transporter = nodemailer.createTransport({
      ...common,
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        type: "OAuth2",
        user: process.env.GMAIL_USER || process.env.LEAD_NOTIFY_TO || "sales@shivacha.com",
        clientId: process.env.GMAIL_OAUTH_CLIENT_ID,
        clientSecret: process.env.GMAIL_OAUTH_CLIENT_SECRET,
        refreshToken: process.env.GMAIL_OAUTH_REFRESH_TOKEN,
      },
    });
  } else if (mode === "smtp") {
    const port = Number(process.env.SMTP_PORT || 465);
    transporter = nodemailer.createTransport({
      ...common,
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port,
      secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  } else {
    transporter = null;
  }
  return transporter;
}

export const mailFrom = () => process.env.MAIL_FROM || `Shivacha Technologies <${process.env.GMAIL_USER || process.env.SMTP_USER || "sales@shivacha.com"}>`;

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
  attachments?: { filename: string; content: string | Buffer; contentType?: string; encoding?: string }[];
}

/** Sends one email. Returns false (never throws) so a mail outage cannot lose the lead. */
export async function sendMail(mail: Mail): Promise<{ sent: boolean; error?: string }> {
  const t = getTransporter();
  if (!t) return { sent: false, error: "Email is not configured" };
  try {
    // Strip CR/LF from headers (header injection defence; nodemailer also sanitises).
    await t.sendMail({ from: mailFrom(), ...mail, subject: mail.subject.replace(/[\r\n]+/g, " ").slice(0, 200) });
    return { sent: true };
  } catch (e) {
    return { sent: false, error: (e as Error).message };
  }
}
