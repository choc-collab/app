"use client";

import { useSyncExternalStore } from "react";

// Static export + Cloudflare _redirects bakes `params.id = "_spa"` into every
// detail page's RSC payload, so `use(params)` returns the placeholder forever.
// Read the real id from `window.location.pathname` instead.
//
// `useSyncExternalStore` is used (not `useState` + `useEffect`) so the id is
// available on the FIRST client render — avoiding a Loading flash on every
// client-side navigation. React handles the SSR/client snapshot mismatch
// internally: hydration matches the server snapshot (`undefined` → Loading,
// same as the built HTML), then the client snapshot (real id) takes over on
// the commit after hydration.
//
// `afterSegment` is the URL segment directly before the id —
// e.g. "fillings" for /fillings/[id], "categories" for /fillings/categories/[id],
// "production" for /production/[id]/products.

function subscribe(callback: () => void): () => void {
  // React only re-reads the snapshot on its own render cycles, but popstate
  // fires on back/forward and lets us pick up external URL changes too.
  window.addEventListener("popstate", callback);
  return () => window.removeEventListener("popstate", callback);
}

function getServerSnapshot(): undefined {
  return undefined;
}

export function useSpaId(afterSegment: string): string | undefined {
  return useSyncExternalStore(
    subscribe,
    () => {
      const parts = window.location.pathname.split("/").filter(Boolean);
      const i = parts.indexOf(afterSegment);
      return i >= 0 && i + 1 < parts.length ? decodeURIComponent(parts[i + 1]) : undefined;
    },
    getServerSnapshot,
  );
}
