import { Suspense } from "react";
import { SideNav } from "@/components/side-nav";
import { SeedLoader } from "@/components/seed-loader";
import { DemoModeOverlay } from "@/components/demo-mode-overlay";
import { AuthGate } from "@/components/auth-gate";
import { IosInstallBanner } from "@/components/ios-install-banner";
import { SectionAccent } from "@/components/section-accent";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Suspense>
        <SectionAccent />
      </Suspense>
      <AuthGate>
        <IosInstallBanner />
        <div className="flex min-h-screen">
          <Suspense>
            <SideNav />
          </Suspense>
          <main
            className="flex-1 min-w-0 min-h-screen transition-[margin-left] duration-200"
            style={{ marginLeft: "var(--nav-w)" }}
          >
            <Suspense fallback={null}>{children}</Suspense>
          </main>
        </div>
      </AuthGate>
      <SeedLoader />
      <DemoModeOverlay />
    </>
  );
}
