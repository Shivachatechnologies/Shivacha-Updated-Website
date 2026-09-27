import type { ReactNode } from "react";
import { siteConfig } from "@/data/siteConfig";
import { mainNav } from "@/data/navigation";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { CommandPalette } from "@/components/layout/CommandPalette";
import { TalkToShivacha } from "@/components/leads/TalkToShivacha";
import { CalendlyModalHost } from "@/components/leads/BookCall";
import { ExitIntent } from "@/components/leads/ExitIntent";
import { Analytics } from "@/components/layout/Analytics";
import { JsonLd } from "@/components/ui/primitives";
import { organizationSchema, websiteSchema } from "@/lib/jsonld";
import type { NavColumn } from "@/data/types";
import type { SiteSettings } from "@/lib/admin/settings";
import { AnnouncementBar } from "@/components/layout/AnnouncementBar";

/** Public website chrome: header, footer, floating lead widgets, search and analytics. Not used by /admin. */
export function SiteChrome({ children, footerNav, settings }: { children: ReactNode; footerNav?: NavColumn[]; settings?: SiteSettings }) {
  const phone = settings?.contactPhone || siteConfig.contact.phone;
  return (
    <>
      <JsonLd data={[organizationSchema(), websiteSchema()]} />
      {settings?.announcementEnabled && settings.announcementText && <AnnouncementBar text={settings.announcementText} href={settings.announcementHref} />}
      <Header nav={mainNav} contact={{ email: settings?.contactEmail || siteConfig.contact.email, phone, phoneHref: settings?.contactPhone ? `tel:${phone.replace(/[^\d+]/g, "")}` : siteConfig.contact.phoneHref }} />
      <main id="main">{children}</main>
      <Footer nav={footerNav} />
      <TalkToShivacha />
      <CalendlyModalHost />
      <ExitIntent />
      <CommandPalette />
      <Analytics />
    </>
  );
}
