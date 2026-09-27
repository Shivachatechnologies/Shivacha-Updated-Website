import { SiteChrome } from "@/components/layout/SiteChrome";
import { getFooterNav, getSiteSettings } from "@/lib/cms/public";

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const [footerNav, settings] = await Promise.all([getFooterNav(), getSiteSettings()]);
  return (
    <SiteChrome footerNav={footerNav} settings={settings}>
      {children}
    </SiteChrome>
  );
}
