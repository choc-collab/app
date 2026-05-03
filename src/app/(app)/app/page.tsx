"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Legacy redirect: `/app` was the home dashboard before the Today
 *  reorganization. Anyone landing here (bookmark, external link) is bounced
 *  to `/today`. The hosted edge configs (`public/_redirects`, `vercel.json`)
 *  also redirect at the CDN layer; this client-side fallback covers `next dev`
 *  and any environment where the edge rule isn't present. */
export default function LegacyHomeRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/today");
  }, [router]);
  return null;
}
