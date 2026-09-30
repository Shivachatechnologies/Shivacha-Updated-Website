import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth/session";
import { can, ROLE_LABELS } from "@/lib/auth/permissions";
import { logoutAction } from "@/lib/auth/actions";
import { globalSearch } from "@/lib/admin/search";
import { ADMIN_NAV, QUICK_CREATE } from "@/lib/admin/nav";
import { shellStatus } from "@/lib/admin/shell";
import { AdminShell } from "@/components/admin/shell";
import { hasDatabase } from "@/lib/db/client";
import { getFlags } from "@/lib/os/flags";
import { voiceConsoleOptions } from "@/lib/voice/options";
import { TalkButton } from "@/components/admin/voice/talk-button";
import { hydrateVault } from "@/lib/integrations/vault";

export const dynamic = "force-dynamic";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  if (!hasDatabase()) return <DatabaseMissing />;
  const user = await requireUser();
  const [flags] = await Promise.all([getFlags(), hydrateVault()]);
  const ai = flags.AI_WORKFORCE && can(user.role, "ai:view");
  const talk = flags.AI_WORKFORCE && can(user.role, "voice:use") && can(user.role, "ai:execute");
  const [status, jar, voice] = await Promise.all([shellStatus(user.id, { ai }), cookies(), talk ? voiceConsoleOptions(user.role).catch(() => null) : null]);
  const groups = ADMIN_NAV.filter((g) => !g.flag || flags[g.flag])
    .map((g) => ({ title: g.title, icon: g.icon, items: g.items.filter((i) => can(user.role, i.permission) && (!i.flag || flags[i.flag])).map(({ label, href, icon }) => ({ label, href, icon })) }))
    .filter((g) => g.items.length);
  const quickCreate = QUICK_CREATE.filter((q) => can(user.role, q.permission) && (!q.flag || flags[q.flag])).map(({ label, href, icon }) => ({ label, href, icon }));
  const badges: Record<string, number> = { "/admin/notifications": status.unread };
  if (ai) badges["/admin/ai/approvals"] = status.ai.pendingApprovals;
  return (
    <AdminShell
      groups={groups}
      user={{ name: user.name, role: ROLE_LABELS[user.role] }}
      status={status}
      badges={badges}
      quickCreate={quickCreate}
      initialCollapsed={jar.get("os_sidebar")?.value === "1"}
      search={globalSearch}
      canAskAI={flags.AI_WORKFORCE && can(user.role, "ai:execute")}
      logout={logoutAction}
    >
      {children}
      {voice && <TalkButton agents={voice.agents} providers={voice.providers} profiles={voice.profiles} />}
    </AdminShell>
  );
}

function DatabaseMissing() {
  return (
    <main className="mx-auto max-w-lg px-6 py-24">
      <h1 className="text-xl font-semibold text-fg">Database not configured</h1>
      <p className="mt-2 text-sm text-muted">Set the DATABASE_URL environment variable (Neon PostgreSQL) on the server, run the migrations and create the first Super Admin with <code className="font-mono">npm run admin:create</code>. See README → Admin panel.</p>
    </main>
  );
}
