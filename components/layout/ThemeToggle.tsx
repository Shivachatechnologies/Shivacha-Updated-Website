"use client";

import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/cn";

const THEME_COLORS = { dark: "#03070f", light: "#f6f8fb" } as const;

/** Switches between dark and light themes; the choice is remembered in localStorage. */
export function ThemeToggle({ className }: { className?: string }) {
  const toggle = () => {
    const root = document.documentElement;
    const next = root.dataset.theme === "light" ? "dark" : "light";
    root.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {}
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", THEME_COLORS[next]));
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Toggle dark and light theme"
      title="Toggle theme"
      className={cn(
        "flex size-9 items-center justify-center rounded-full border border-line bg-tint/[0.03] text-muted transition-colors hover:border-line-strong hover:text-fg",
        className,
      )}
    >
      <Sun className="size-4 light:hidden" aria-hidden />
      <Moon className="hidden size-4 light:block" aria-hidden />
    </button>
  );
}
