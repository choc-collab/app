import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

const cloudHttps = process.env.NEXT_PUBLIC_DEXIE_CLOUD_URL;
const cloudWss = cloudHttps?.replace(/^https:\/\//, "wss://");
const cloudConnectSrc = cloudHttps && cloudWss ? `${cloudHttps} ${cloudWss} ` : "";

const csp = [
  "default-src 'self'",
  // Next.js requires unsafe-inline for inline scripts/styles it generates.
  // Turbopack (dev) also requires unsafe-eval for React's stack-trace reconstruction.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  // data: and blob: needed for base64 product/mould photos and object URLs
  "img-src 'self' data: blob:",
  // Dexie Cloud sync (HTTPS + WebSocket, origin from NEXT_PUBLIC_DEXIE_CLOUD_URL)
  `connect-src 'self' ${cloudConnectSrc}`.trim(),
  // Service worker
  "worker-src 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "geolocation=(), microphone=(), camera=()" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      { source: "/lab", destination: "/", permanent: false },
      { source: "/calculator", destination: "/", permanent: false },
      { source: "/calculator/:path*", destination: "/", permanent: false },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
