"use client";

import { useEffect, useState } from "react";
import { Copy, X } from "lucide-react";

const AUTO_DISMISS_MS = 3500;

export function DuplicatedToast({ active }: { active: boolean }) {
  const [visible, setVisible] = useState(active);

  useEffect(() => {
    if (!active) return;
    setVisible(true);
    const params = new URLSearchParams(window.location.search);
    if (params.has("duplicate")) {
      params.delete("duplicate");
      const qs = params.toString();
      const url = window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash;
      window.history.replaceState(null, "", url);
    }
    const id = setTimeout(() => setVisible(false), AUTO_DISMISS_MS);
    return () => clearTimeout(id);
  }, [active]);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-3 rounded-md border border-accent bg-accent text-accent-foreground px-3 py-2"
    >
      <Copy className="w-4 h-4 shrink-0" aria-hidden="true" />
      <span className="text-xs flex-1 min-w-0">Duplicated — editing your copy</span>
      <button
        type="button"
        onClick={() => setVisible(false)}
        aria-label="Dismiss"
        className="text-accent-foreground/60 hover:text-accent-foreground transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
