import type { NextConfig } from "next";

// Static export: the app is entirely client-side (Dexie IndexedDB, `"use client"`
// on every page, no API routes). Redirects and headers migrated to
// `public/_redirects` / `public/_headers` (Cloudflare Pages) and `vercel.json`
// (Vercel) — next.config's `redirects()` / `headers()` aren't supported with
// `output: "export"`.
//
// Export is only applied to production builds. Dev mode (`next dev`) behaves as
// a normal Next.js server so Playwright tests can navigate to real UUIDs
// without tripping the generateStaticParams check.
const isProd = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
  ...(isProd ? { output: "export" as const } : {}),
  reactStrictMode: true,
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
