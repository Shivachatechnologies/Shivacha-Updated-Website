"use client";

import Script from "next/script";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { track } from "@/lib/analytics";
import { recordPageView } from "@/lib/attribution";

const GA = process.env.NEXT_PUBLIC_GA_ID;
const PIXEL = process.env.NEXT_PUBLIC_META_PIXEL_ID;
const LINKEDIN = process.env.NEXT_PUBLIC_LINKEDIN_PARTNER_ID;

/**
 * Loads analytics tools only when their IDs are configured, and tracks CTA, contact and demo clicks
 * site-wide through a single delegated listener (no per-button client components required).
 */
export function Analytics() {
  const pathname = usePathname();

  // Engagement: page views (for lead scoring), service/hire page views and scroll depth per page.
  useEffect(() => {
    recordPageView(pathname);
    if (pathname.startsWith("/services/") || pathname.startsWith("/hire-")) track("service_page_view", { path: pathname });
    const marks = [25, 50, 75, 100];
    const seen = new Set<number>();
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const h = document.documentElement.scrollHeight - window.innerHeight;
        if (h <= 0) return;
        const pct = (window.scrollY / h) * 100;
        for (const m of marks) if (pct >= m - 2 && !seen.has(m)) {
          seen.add(m);
          track("scroll_depth", { percent: m, path: pathname });
        }
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
    };
  }, [pathname]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest("a,button") as HTMLAnchorElement | null;
      if (!a) return;
      const tag = a.dataset.track;
      const href = a.getAttribute("href") ?? "";
      if (href.startsWith("mailto:")) track("email_click", { href });
      else if (href.startsWith("tel:")) track("phone_click", { href });
      else if (href.includes("wa.me")) track("whatsapp_click", { href });
      if (!tag) return;
      if (tag.startsWith("demo")) track("demo_click", { label: tag, href });
      else if (tag.startsWith("case_study_cta")) track("case_study_cta", { label: tag, path: window.location.pathname });
      else track("cta_click", { label: tag, href, path: window.location.pathname });
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  return (
    <>
      {GA && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA}`} strategy="afterInteractive" />
          <Script id="ga-init" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;gtag('js',new Date());gtag('config','${GA}');`}
          </Script>
        </>
      )}
      {PIXEL && (
        <Script id="meta-pixel" strategy="lazyOnload">
          {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${PIXEL}');fbq('track','PageView');`}
        </Script>
      )}
      {LINKEDIN && (
        <Script id="linkedin-insight" strategy="lazyOnload">
          {`window._linkedin_partner_id="${LINKEDIN}";window._linkedin_data_partner_ids=window._linkedin_data_partner_ids||[];window._linkedin_data_partner_ids.push(window._linkedin_partner_id);(function(l){if(!l){window.lintrk=function(a,b){window.lintrk.q.push([a,b])};window.lintrk.q=[]}var s=document.getElementsByTagName("script")[0];var b=document.createElement("script");b.type="text/javascript";b.async=true;b.src="https://snap.licdn.com/li.lms-analytics/insight.min.js";s.parentNode.insertBefore(b,s);})(window.lintrk);`}
        </Script>
      )}
    </>
  );
}
