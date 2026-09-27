import { db } from "@/lib/db/client";
import { requirePermission } from "@/lib/auth/session";
import { saveSettingAction } from "@/lib/admin/system-actions";
import { SETTING_DEFAULTS, type SiteSettings } from "@/lib/admin/settings";
import { isCalendlyConfigured, calendlyUrl } from "@/lib/calendly";
import { siteConfig } from "@/data/siteConfig";
import { storageMode } from "@/lib/storage";
import { Badge, PageHeader, Panel, inputCls, labelCls } from "@/components/admin/ui";
import { SubmitButton } from "@/components/admin/client";
import { ActionForm, FieldError } from "@/components/admin/forms";

export const metadata = { title: "Settings" };

const configured = (v: boolean) => (v ? <Badge tone="green">Configured</Badge> : <Badge>Not set</Badge>);

export default async function SettingsPage() {
  await requirePermission("settings:manage");
  const row = await db.setting.findUnique({ where: { key: "site" } });
  const s: SiteSettings = { ...SETTING_DEFAULTS.site, ...((row?.value as object) ?? {}) };
  const env = process.env;
  return (
    <>
      <PageHeader title="Settings" description="Non-secret site settings. Credentials (SMTP, API keys, database, tokens) are environment variables only and are never stored or shown here." crumbs={[{ label: "Settings" }]} />
      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Site">
          <ActionForm action={saveSettingAction.bind(null, "site")} className="space-y-4">
            <fieldset className="space-y-3">
              <legend className="text-[12.5px] font-semibold text-fg">Announcement bar</legend>
              <label className="flex items-center gap-2 text-sm text-fg">
                <input type="checkbox" name="announcementEnabled" defaultChecked={s.announcementEnabled} className="size-4" /> Show at the top of every public page
              </label>
              <div>
                <label className={labelCls} htmlFor="at">Text</label>
                <input id="at" name="announcementText" maxLength={160} defaultValue={s.announcementText} className={inputCls} />
                <FieldError name="announcementText" />
              </div>
              <div>
                <label className={labelCls} htmlFor="ah">Link</label>
                <input id="ah" name="announcementHref" defaultValue={s.announcementHref} placeholder="/products/crypto-exchange" className={inputCls} />
                <FieldError name="announcementHref" />
              </div>
            </fieldset>
            <fieldset className="space-y-3 border-t border-line pt-4">
              <legend className="text-[12.5px] font-semibold text-fg">Header contact details</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelCls} htmlFor="ce">Email</label>
                  <input id="ce" name="contactEmail" defaultValue={s.contactEmail} placeholder={siteConfig.contact.email} className={inputCls} />
                  <FieldError name="contactEmail" />
                </div>
                <div>
                  <label className={labelCls} htmlFor="cp">Phone</label>
                  <input id="cp" name="contactPhone" defaultValue={s.contactPhone} placeholder={siteConfig.contact.phone} className={inputCls} />
                  <FieldError name="contactPhone" />
                </div>
              </div>
              <p className="text-xs text-dim">Leave empty to use the defaults shown.</p>
            </fieldset>
            <SubmitButton>Save settings</SubmitButton>
          </ActionForm>
        </Panel>
        <Panel title="Integrations (environment-managed)">
          <p className="mb-3 text-xs text-dim">These are configured with environment variables on the host so that secrets never enter the database. Values are shown only as configured / not set.</p>
          <ul className="divide-y divide-line text-sm">
            {[
              ["Database (DATABASE_URL)", !!env.DATABASE_URL],
              ["Lead email (SMTP / Gmail OAuth)", !!(env.SMTP_PASS || env.GMAIL_OAUTH_REFRESH_TOKEN)],
              ["Google Sheet lead copy", !!(env.GOOGLE_SHEETS_WEBHOOK_URL || env.GOOGLE_SHEETS_LEADS_ID)],
              ["CRM webhook", !!env.CRM_WEBHOOK_URL],
              ["Media storage (BLOB_READ_WRITE_TOKEN)", storageMode() === "blob"],
              ["Spam protection (Turnstile)", !!(env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET_KEY)],
              ["Google Analytics", !!env.NEXT_PUBLIC_GA_ID],
              ["WhatsApp sales number (WHATSAPP_SALES_NUMBER)", !!(env.WHATSAPP_SALES_NUMBER || env.NEXT_PUBLIC_WHATSAPP_SALES_NUMBER)],
            ].map(([k, v]) => (
              <li key={String(k)} className="flex items-center justify-between gap-3 py-2">
                <span className="text-fg">{k}</span>
                {configured(Boolean(v))}
              </li>
            ))}
            <li className="flex items-center justify-between gap-3 py-2">
              <span className="text-fg">Calendly</span>
              <span className="truncate text-xs text-muted">{isCalendlyConfigured() ? calendlyUrl : "Not set — booking falls back to the meeting form"}</span>
            </li>
          </ul>
        </Panel>
      </div>
    </>
  );
}
