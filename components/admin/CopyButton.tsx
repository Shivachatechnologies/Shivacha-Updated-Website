"use client";

import { useToast } from "./client";

export function CopyButton({ text, label = "Copy URL" }: { text: string; label?: string }) {
  const toast = useToast();
  return (
    <button
      type="button"
      className="btn-secondary h-8 px-2.5 text-xs"
      onClick={() =>
        navigator.clipboard.writeText(text.startsWith("/") ? `${location.origin}${text}` : text).then(
          () => toast("ok", "Copied."),
          () => toast("error", "Could not copy."),
        )
      }
    >
      {label}
    </button>
  );
}
