import type { FAQ, Point, Service } from "./types";

/** Parse "Title|Description" strings into Points. Keeps authored data compact and readable. */
export const pts = (items: string[]): Point[] =>
  items.map((s) => {
    const [title, ...rest] = s.split("|");
    return { title: title.trim(), description: rest.join("|").trim() };
  });

export const faqs = (items: [string, string][]): FAQ[] => items.map(([q, a]) => ({ q, a }));

type ServiceExtras = Pick<Service, "technologies" | "industries" | "products" | "related" | "note" | "keywords">;

/** Compact service authoring helper. */
export const svc = (
  slug: string,
  name: string,
  group: string,
  summary: string,
  overview: string,
  useCases: string[],
  capabilities: string[],
  faq: [string, string][],
  extras: ServiceExtras = {},
): Service => ({
  slug,
  name,
  group,
  summary,
  overview,
  useCases: pts(useCases),
  capabilities: pts(capabilities),
  faqs: faqs(faq),
  ...extras,
});
