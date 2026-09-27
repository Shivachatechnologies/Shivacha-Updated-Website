import type { Metadata } from "next";
import { Suspense } from "react";
import { Toaster } from "@/components/admin/client";

export const metadata: Metadata = {
  title: { default: "Client Portal", template: "%s · Shivacha Client Portal" },
  robots: { index: false, follow: false },
};

export default function ClientRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-theme="light" className="min-h-screen bg-ink-950 text-fg">
      <Suspense>
        <Toaster>{children}</Toaster>
      </Suspense>
    </div>
  );
}
