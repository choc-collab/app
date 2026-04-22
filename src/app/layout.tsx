import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import { ServiceWorkerRegister } from "@/components/sw-register";
import { ErrorBoundary } from "@/components/error-boundary";
import { GlobalErrorHandler } from "@/components/global-error-handler";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const isCloudConfigured = Boolean(process.env.NEXT_PUBLIC_DEXIE_CLOUD_URL);
const appTitle = isCloudConfigured ? "Choc-collab" : "Choc-collab — local only";
const cfAnalyticsToken = process.env.NEXT_PUBLIC_CF_ANALYTICS_TOKEN;

export const metadata: Metadata = {
  title: appTitle,
  description: "The all in open source app for artisan chocolatiers.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: appTitle,
  },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <script
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem("nav-collapsed")==="1")document.documentElement.setAttribute("data-nav-collapsed","1")}catch(e){}`,
          }}
        />
      </head>
      <body className="bg-background text-foreground font-sans antialiased">
        <ErrorBoundary>
          {/* Suspense boundary is required for static export: any client component
              using `useSearchParams()` otherwise triggers a CSR bailout and the
              build fails. Fallback is null — the real render happens client-side. */}
          <Suspense fallback={null}>{children}</Suspense>
        </ErrorBoundary>
        <GlobalErrorHandler />
        <ServiceWorkerRegister />
        {cfAnalyticsToken && (
          <script
            defer
            src="https://static.cloudflareinsights.com/beacon.min.js"
            data-cf-beacon={JSON.stringify({ token: cfAnalyticsToken })}
          />
        )}
      </body>
    </html>
  );
}
