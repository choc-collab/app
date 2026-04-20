"use client";

import { useEffect, useState } from "react";

// Static export + Cloudflare _redirects bakes `params.id = "_spa"` into every
// detail page's RSC payload, so `use(params)` returns the placeholder forever.
// Read the real id from `window.location.pathname` after mount instead.
// `afterSegment` is the URL segment directly before the id —
// e.g. "fillings" for /fillings/[id], "categories" for /fillings/categories/[id],
// "production" for /production/[id]/products.
export function useSpaId(afterSegment: string): string | undefined {
  const [id, setId] = useState<string | undefined>(undefined);
  useEffect(() => {
    const parts = window.location.pathname.split("/").filter(Boolean);
    const i = parts.indexOf(afterSegment);
    if (i >= 0 && i + 1 < parts.length) {
      setId(decodeURIComponent(parts[i + 1]));
    }
  }, [afterSegment]);
  return id;
}
