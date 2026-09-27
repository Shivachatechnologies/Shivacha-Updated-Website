import { saveArticleAction } from "@/lib/knowledge/actions";
import { KB_CATEGORIES, KB_CATEGORY_LABEL, KB_VISIBILITY_HELP } from "@/lib/knowledge/constants";
import { Panel } from "./ui";
import { ActionForm } from "./forms";
import { SubmitButton } from "./client";
import { SelectField, TextArea, TextField } from "./os";

type Article = { id: string; title: string; slug: string; excerpt: string | null; body: string; category: string; tags: string[]; visibility: string; status: string; seoTitle: string | null; seoDescription: string | null };

export function KnowledgeForm({ article }: { article?: Article }) {
  return (
    <ActionForm action={saveArticleAction.bind(null, article?.id ?? null)} className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-4">
        <Panel title="Article">
          <div className="space-y-4">
            <TextField name="title" label="Title" required maxLength={200} defaultValue={article?.title} />
            <TextField name="excerpt" label="Summary" maxLength={300} defaultValue={article?.excerpt} hint="Shown in search results and the help centre list." />
            <TextArea name="body" label="Body (Markdown)" rows={20} required defaultValue={article?.body} hint="Headings (#), bullet lists (-), **bold**, `code` and [links](https://…) are supported." />
          </div>
        </Panel>
      </div>
      <aside className="space-y-4">
        <Panel title="Publishing">
          <div className="space-y-4">
            <SelectField name="status" label="Status" options={[["DRAFT", "Draft"], ["PUBLISHED", "Published"], ["ARCHIVED", "Archived"]]} defaultValue={article?.status ?? "DRAFT"} />
            <SelectField name="visibility" label="Visibility" options={Object.entries(KB_VISIBILITY_HELP).map(([k, v]) => [k, `${k.charAt(0)}${k.slice(1).toLowerCase()} — ${v}`] as const)} defaultValue={article?.visibility ?? "INTERNAL"} />
            <SelectField name="category" label="Category" options={KB_CATEGORIES.map((c) => [c, KB_CATEGORY_LABEL[c]] as const)} defaultValue={article?.category ?? "SUPPORT"} />
            <TextField name="tags" label="Tags" defaultValue={article?.tags.join(", ")} hint="Comma separated." />
            <TextField name="slug" label="URL slug" defaultValue={article?.slug} hint="Leave empty to generate from the title." />
          </div>
        </Panel>
        <Panel title="SEO (public articles)">
          <div className="space-y-4">
            <TextField name="seoTitle" label="SEO title" maxLength={70} defaultValue={article?.seoTitle} />
            <TextArea name="seoDescription" label="Meta description" rows={3} defaultValue={article?.seoDescription} />
          </div>
        </Panel>
        <SubmitButton>{article ? "Save article" : "Create article"}</SubmitButton>
      </aside>
    </ActionForm>
  );
}
