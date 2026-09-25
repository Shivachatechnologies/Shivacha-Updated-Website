"use client";

import { useEffect } from "react";
import { track } from "@/lib/analytics";

export function ProductViewTracker({ slug, division }: { slug: string; division: string }) {
  useEffect(() => {
    track("product_view", { product: slug, division });
  }, [slug, division]);
  return null;
}
