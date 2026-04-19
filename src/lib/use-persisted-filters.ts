"use client";

import { useState, useEffect, useCallback, useRef } from "react";

/**
 * Persists filter state to sessionStorage so it survives list→detail→back navigation.
 *
 * Initializes with defaults on first render (SSR-safe), then restores from
 * sessionStorage in a post-hydration effect to avoid hydration mismatches.
 *
 * Usage:
 *   const [filters, setFilter] = usePersistedFilters("layers", {
 *     search: "",
 *     showFilters: false,
 *     filterStatus: "",
 *     filterCategories: [] as string[],
 *     showArchived: false,
 *   });
 *
 *   // Read:  filters.search
 *   // Write: setFilter("search", "ganache")
 *
 * Sets are stored as arrays — declare them as `string[]` in the defaults and
 * wrap with `new Set()` / `Array.from()` in your component.
 */
export function usePersistedFilters<T extends Record<string, unknown>>(
  key: string,
  defaults: T,
): [T, <K extends keyof T>(field: K, value: T[K]) => void] {
  const storageKey = `filters:${key}`;
  const hydrated = useRef(false);

  const [state, setState] = useState<T>(defaults);

  // Restore from sessionStorage after hydration (runs once on mount)
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        setState((prev) => ({ ...prev, ...parsed }));
      }
    } catch {}
    hydrated.current = true;
  }, [storageKey]);

  // Persist to sessionStorage on every change (skip the initial mount)
  useEffect(() => {
    if (!hydrated.current) return;
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(state));
    } catch {}
  }, [storageKey, state]);

  const setFilter = useCallback(<K extends keyof T>(field: K, value: T[K]) => {
    setState((prev) => ({ ...prev, [field]: value }));
  }, []);

  return [state, setFilter];
}
