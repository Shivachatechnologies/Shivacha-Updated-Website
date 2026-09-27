import type { Metadata } from "next";
import { Suspense } from "react";
import { Toaster } from "@/components/admin/client";

export const metadata: Metadata = {
  title: { default: "Shivacha Admin", template: "%s · Shivacha Admin" },
  robots: { index: false, follow: false },
};

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-theme="light" className="min-h-screen bg-ink-950 text-fg">
      <Suspense>
        <Toaster>{children}</Toaster>
      </Suspense>
    </div>
  );
}
