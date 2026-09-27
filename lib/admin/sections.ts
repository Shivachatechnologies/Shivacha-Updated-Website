import { z } from "zod";

/** Page-builder section types. Shared by the admin builder, the save action and the public renderer. */
export const SECTION_TYPES = {
  hero: { label: "Hero", fields: [["eyebrow", "Eyebrow", "text"], ["title", "Title", "text"], ["body", "Text", "textarea"], ["ctaLabel", "Button label", "text"], ["ctaHref", "Button link", "text"]] },
  text: { label: "Rich text", fields: [["title", "Heading", "text"], ["body", "Content (Markdown)", "markdown"]] },
  features: { label: "Feature grid", fields: [["title", "Heading", "text"], ["intro", "Intro", "textarea"], ["items", "Items — one per line: Title | Description", "markdown"]] },
  image: { label: "Image", fields: [["src", "Image URL", "text"], ["alt", "Alt text", "text"], ["caption", "Caption", "text"]] },
  faq: { label: "FAQ", fields: [["title", "Heading", "text"], ["items", "Questions — one per line: Question | Answer", "markdown"]] },
  cta: { label: "Call to action", fields: [["title", "Heading", "text"], ["body", "Text", "textarea"], ["ctaLabel", "Button label", "text"], ["ctaHref", "Button link", "text"]] },
} as const satisfies Record<string, { label: string; fields: readonly (readonly [string, string, "text" | "textarea" | "markdown"])[] }>;

export type SectionType = keyof typeof SECTION_TYPES;
export interface SectionInput {
  id?: string;
  type: SectionType;
  hidden: boolean;
  data: Record<string, string>;
}

const safeHref = z
  .string()
  .max(2000)
  .refine((v) => !v || /^(https?:\/\/|\/(?!\/)|#|mailto:|tel:)/i.test(v), "Links must start with https://, / , #, mailto: or tel:");

export const sectionsSchema = z
  .array(
    z.object({
      id: z.string().max(40).optional(),
      type: z.enum(Object.keys(SECTION_TYPES) as [SectionType, ...SectionType[]]),
      hidden: z.boolean(),
      data: z.record(z.string(), z.string().max(20000)),
    }),
  )
  .max(60)
  .superRefine((arr, ctx) => {
    arr.forEach((s, i) => {
      for (const k of ["ctaHref", "src"]) {
        const v = s.data[k];
        if (v && !safeHref.safeParse(v).success) ctx.addIssue({ code: "custom", path: [i, "data", k], message: `Section ${i + 1}: invalid link` });
      }
    });
  });

export const parsePairs = (s = "") =>
  s
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const i = l.indexOf("|");
      return i < 0 ? [l, ""] : [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    });
