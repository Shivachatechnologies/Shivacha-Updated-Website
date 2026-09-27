import { notFound } from "next/navigation";
import { db } from "@/lib/db/client";
import { can } from "@/lib/auth/permissions";
import { requireAccess } from "@/lib/os/guard";
import { agentBySlug } from "@/lib/ai/catalog";
import { canRunAgent } from "@/lib/ai/agents";
import { voiceConsoleOptions } from "@/lib/voice/options";
import { saveVoiceProfileAction } from "@/lib/voice/actions";
import { OPENAI_VOICES, VOICE_PROVIDERS } from "@/lib/voice/provider";
import { VOICE_LANGUAGES } from "@/lib/voice/languages";
import { SelectField, TextField } from "@/components/admin/os";
import { PageHeader, Panel } from "@/components/admin/ui";
import { ActionForm } from "@/components/admin/forms";
import { SubmitButton } from "@/components/admin/client";
import { VoiceConsole } from "@/components/admin/voice/console";

export const metadata = { title: "Talk" };
export const maxDuration = 300;

export default async function AgentVoicePage({ params }: { params: Promise<{ slug: string }> }) {
  const user = await requireAccess("voice:use", "AI_WORKFORCE");
  const { slug } = await params;
  const spec = agentBySlug(slug);
  if (!spec || !canRunAgent(user.role, spec)) notFound();
  const [opts, agent, profile] = await Promise.all([voiceConsoleOptions(user.role), db.aIAgent.findUnique({ where: { slug }, select: { name: true, personaName: true, jobTitle: true } }), db.aIEmployeeVoiceProfile.findUnique({ where: { agentSlug: slug } })]);
  const name = agent?.personaName ?? agent?.name ?? spec.name;
  const configure = can(user.role, "ai:configure");
  return (
    <>
      <PageHeader title={`Talk to ${name}`} description={agent?.jobTitle ?? spec.description} crumbs={[{ label: "AI Employees", href: "/admin/ai/employees" }, { label: name, href: `/admin/ai/employees/${slug}` }, { label: "Talk" }]} />
      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <Panel>
          <VoiceConsole agents={opts.agents.filter((a) => a.slug === slug)} initialAgent={slug} providers={opts.providers} profiles={opts.profiles} />
        </Panel>
        {configure && (
          <Panel title="Voice settings">
            <ActionForm action={saveVoiceProfileAction.bind(null, slug)} className="space-y-3">
              <SelectField name="provider" label="Default engine" options={Object.values(VOICE_PROVIDERS).map((p) => [p.id, `${p.label}${p.configured() ? "" : " (not configured)"}`] as const)} defaultValue={profile?.provider ?? "browser"} />
              <SelectField name="language" label="Default language" options={Object.entries(VOICE_LANGUAGES).map(([k, v]) => [k, v.label] as const)} defaultValue={profile?.language ?? "en-IN"} />
              <TextField name="voiceId" label="Voice" defaultValue={profile?.voiceId} placeholder={`OpenAI: ${OPENAI_VOICES.slice(0, 3).join(", ")}… · Browser: voice name`} />
              <TextField name="rate" type="number" label="Speaking rate (0.75–1.5)" defaultValue={profile ? Number(profile.rate) : 1} />
              <TextField name="style" label="Style note" defaultValue={profile?.style} placeholder="Warm, concise" />
              <p className="text-xs text-dim">Stock voices only. Voice cloning is not supported.</p>
              <SubmitButton>Save</SubmitButton>
            </ActionForm>
          </Panel>
        )}
      </div>
    </>
  );
}
