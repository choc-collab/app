import type { NextConfig } from "next";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

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

const pkgPath = resolve(dirname(fileURLToPath(import.meta.url)), "package.json");
const { version: appVersion } = JSON.parse(readFileSync(pkgPath, "utf8")) as { version: string };

const nextConfig: NextConfig = {
  ...(isProd ? { output: "export" as const } : {}),
  reactStrictMode: true,
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  env: {
    NEXT_PUBLIC_APP_VERSION: appVersion,
  },
};

export default nextConfig;
