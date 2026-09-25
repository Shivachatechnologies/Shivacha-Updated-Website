import type { DivisionId, TechCategory, Technology } from "../types";
import { pts } from "../_helpers";

export const tech = (
  slug: string,
  name: string,
  category: TechCategory,
  summary: string,
  overview: string,
  strengths: string[],
  howWeUse: string[],
  pairsWith: string[],
  services: string[],
  divisions: DivisionId[],
  considerations?: string,
): Technology => ({
  slug,
  name,
  category,
  summary,
  overview,
  strengths,
  howWeUse: pts(howWeUse),
  pairsWith,
  services,
  divisions,
  considerations,
});
