"use client";

import { useEffect } from "react";
import { track } from "@/lib/analytics";

export function ProductViewTracker({ slug, division }: { slug: string; division: string }) {
  useEffect(() => {
    track("product_view", { product: slug, division });
  }, [slug, division]);
  return null;
}

/** Fires a lead_magnet_view event for gated resources (guides, checklists, templates). */
export function LeadMagnetViewTracker({ slug, category }: { slug: string; category: string }) {
  useEffect(() => {
    track("lead_magnet_view", { resource: slug, category });
  }, [slug, category]);
  return null;
}
