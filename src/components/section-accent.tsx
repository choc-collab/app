"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * Maps route prefixes to a pastel accent. Each pastel is defined in
 * `globals.css` via `--accent-<name>-bg` / `--accent-<name>-ink`, and the
 * `body[data-accent="<name>"]` rules rewire `--color-primary` so every
 * `bg-primary` / `text-primary-foreground` / `btn-primary` / active-tab
 * style in the app picks it up automatically.
 *
 * To add a new accent:
 *   1. Define tokens in globals.css (`--accent-foo-bg` + `--accent-foo-ink`)
 *   2. Add a `body[data-accent="foo"] { … }` rule in globals.css
 *   3. Add one line to the map below
 *
 * The most-specific prefix wins (longest match), so `/pantry/decoration`
 * can override `/pantry`.
 */
const ROUTE_ACCENTS: Record<string, string> = {
  "/products": "cocoa",
  "/fillings": "peach",
  "/ingredients": "sage",
  "/moulds": "blue",
  "/packaging": "lilac",
  "/collections": "butter",
  "/pantry/decoration": "mint",
  "/workshop": "terracotta",
  "/production": "terracotta",
  "/stock": "taupe",
  "/shop": "cocoa",
  "/shop/giveaways": "lilac",
  // Lab, Observatory, Pricing, Stats, Settings, Shopping → no accent (falls
  // back to black). Add an entry here if a section should get a color.
};

function resolveAccent(pathname: string): string | null {
  let best: { prefix: string; accent: string } | null = null;
  for (const [prefix, accent] of Object.entries(ROUTE_ACCENTS)) {
    if (pathname === prefix || pathname.startsWith(prefix + "/")) {
      if (!best || prefix.length > best.prefix.length) {
        best = { prefix, accent };
      }
    }
  }
  return best?.accent ?? null;
}

export function SectionAccent() {
  const pathname = usePathname();
  useEffect(() => {
    const accent = resolveAccent(pathname);
    if (accent) {
      document.body.dataset.accent = accent;
    } else {
      delete document.body.dataset.accent;
    }
  }, [pathname]);
  return null;
}
