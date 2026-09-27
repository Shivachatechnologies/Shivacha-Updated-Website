export default function PortalAuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-screen place-items-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/shivacha-mark.svg" alt="" className="size-7" />
          <span className="text-[15px] font-semibold tracking-tight text-fg">
            Shivacha <span className="font-normal text-muted">Client Portal</span>
          </span>
        </div>
        {children}
      </div>
    </main>
  );
}
