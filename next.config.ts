import type { NextConfig } from "next";

// Static export: the app is entirely client-side (Dexie IndexedDB, `"use client"`
// on every page, no API routes). Redirects and headers migrated to
// `public/_redirects` and `public/_headers` — next.config's `redirects()` /
// `headers()` aren't supported with `output: "export"`.
const nextConfig: NextConfig = {
  output: "export",
  reactStrictMode: true,
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
