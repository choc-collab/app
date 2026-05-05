"use client";

import { useState, useEffect, useRef, useCallback } from "react";

export type ViewDensity = "default" | "compact";

/**
 * Per-page list density preference, persisted in localStorage so it survives
 * across sessions. Each page passes a unique `key` so the products setting
 * doesn't leak into fillings or ingredients.
 */
export function usePersistedDensity(
  key: string,
  defaultDensity: ViewDensity = "default",
): [ViewDensity, (next: ViewDensity) => void] {
  const storageKey = `density:${key}`;
  const hydrated = useRef(false);
  const [density, setDensityState] = useState<ViewDensity>(defaultDensity);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw === "compact" || raw === "default") {
        setDensityState(raw);
      }
    } catch {}
    hydrated.current = true;
  }, [storageKey]);

  const setDensity = useCallback(
    (next: ViewDensity) => {
      setDensityState(next);
      try {
        localStorage.setItem(storageKey, next);
      } catch {}
    },
    [storageKey],
  );

  return [density, setDensity];
}
