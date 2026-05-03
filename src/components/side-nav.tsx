"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useObservable } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import { db, isCloudConfigured } from "@/lib/db";
import { usePendingShoppingCount } from "@/lib/hooks";

type NavItem = {
  href: string;
  label: string;
  icon: (props: { className?: string }) => React.ReactNode;
  disabled?: boolean;
};

type SectionDef = {
  label: string;
  routes: string[];
  items: NavItem[];
};

const SECTIONS: SectionDef[] = [
  {
    label: "The Workshop",
    routes: ["/workshop", "/production", "/stock"],
    items: [
      { href: "/production", label: "Production", icon: ProductionIcon },
      { href: "/stock", label: "Stock", icon: StockIcon },
    ],
  },
  {
    label: "The Pantry",
    routes: ["/pantry", "/products", "/fillings", "/ingredients", "/moulds", "/packaging", "/collections", "/pantry/decoration"],
    items: [
      { href: "/products", label: "Products", icon: ProductsIcon },
      { href: "/fillings", label: "Fillings", icon: FillingsIcon },
      { href: "/ingredients", label: "Ingredients", icon: IngredientsIcon },
      { href: "/moulds", label: "Moulds", icon: MouldsIcon },
      { href: "/packaging", label: "Packaging", icon: PackagingIcon },
      { href: "/collections", label: "Collections", icon: CollectionsIcon },
      { href: "/pantry/decoration", label: "Decoration", icon: DecorationNavIcon },
    ],
  },
  {
    label: "The Lab",
    routes: ["/lab", "/calculator"],
    items: [
      { href: "/lab", label: "Product Lab", icon: FlaskIcon, disabled: true },
    ],
  },
  {
    label: "The Observatory",
    routes: ["/observatory", "/pricing", "/stats"],
    items: [
      { href: "/pricing", label: "Pricing", icon: PricingIcon },
      { href: "/stats", label: "Stats", icon: StatsIcon },
      { href: "/observatory/product-cost", label: "Product Cost", icon: ProductCostIcon },
      { href: "/observatory/shop", label: "Shop Insights", icon: ShopInsightsIcon },
    ],
  },
];

const HOME_ITEMS: NavItem[] = [
  { href: "/workshop", label: "Workshop", icon: WorkshopIcon },
  { href: "/pantry", label: "Pantry", icon: PantryIcon },
  { href: "/lab", label: "Lab", icon: FlaskIcon, disabled: true },
  { href: "/observatory", label: "Observatory", icon: ObservatoryIcon },
  { href: "/shop", label: "Shop", icon: ShopIcon },
];

const FROM_TO_ROUTE: Record<string, string> = {
  pricing: "/pricing",
  stats: "/stats",
  "product-cost": "/observatory/product-cost",
  "shop-insights": "/observatory/shop",
  production: "/production",
  stock: "/stock",
};

function getActiveSection(pathname: string, from?: string | null): SectionDef | null {
  if (from) {
    const overrideRoute = FROM_TO_ROUTE[from];
    if (overrideRoute) {
      const match = SECTIONS.find((s) => s.routes.some((r) => overrideRoute === r || overrideRoute.startsWith(r + "/")));
      if (match) return match;
    }
  }
  for (const section of SECTIONS) {
    if (section.routes.some((r) => pathname === r || pathname.startsWith(r + "/"))) {
      return section;
    }
  }
  return null;
}

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + "/");
}

export function SideNav() {
  const livePathname = usePathname();
  const searchParams = useSearchParams();
  const pendingShoppingCount = usePendingShoppingCount();

  // Snapshot the URL state on first render and keep using it until after
  // hydration. The router can advance mid-hydration (a Playwright click or
  // a prefetch racing with the hydration pass), which would otherwise make
  // the in-flight render disagree with the server HTML and throw a mismatch.
  const [initialPathname] = useState(() => livePathname);
  const [initialFrom] = useState(() => searchParams.get("from"));
  const [mounted, setMounted] = useState(false);

  const pathname = mounted ? livePathname : initialPathname;
  const from = mounted ? searchParams.get("from") : initialFrom;
  const activeSection = getActiveSection(pathname, from);

  // User-toggled collapse; initial value read from the attribute set by the
  // pre-hydration script in layout.tsx so there's no flash on refresh.
  const [collapsed, setCollapsed] = useState<boolean>(false);
  useEffect(() => {
    setMounted(true);
    setCollapsed(document.documentElement.getAttribute("data-nav-collapsed") === "1");
  }, []);
  useEffect(() => {
    if (collapsed) {
      document.documentElement.setAttribute("data-nav-collapsed", "1");
      try { localStorage.setItem("nav-collapsed", "1"); } catch {}
    } else {
      document.documentElement.removeAttribute("data-nav-collapsed");
      try { localStorage.setItem("nav-collapsed", "0"); } catch {}
    }
  }, [collapsed]);

  // When the user has collapsed the nav, force the narrow width even on sm+.
  // Otherwise respect the responsive default (w-14 on mobile, w-44 on sm+).
  const widthClass = collapsed ? "w-14" : "w-14 sm:w-44";
  const showLabels = !collapsed;

  const renderItem = (item: NavItem) => {
    const badge = item.href === "/shopping" && pendingShoppingCount > 0 ? pendingShoppingCount : 0;
    if (item.disabled) {
      return (
        <span
          key={item.href}
          className="flex items-center gap-3 px-2 py-2.5 rounded-lg text-muted-foreground/40 cursor-not-allowed"
        >
          <item.icon className="w-5 h-5 shrink-0" />
          <span className={`${showLabels ? "hidden sm:block" : "hidden"} text-sm truncate`}>{item.label}</span>
        </span>
      );
    }

    const active = isActive(pathname, item.href);
    return (
      <Link
        key={item.href}
        href={item.href}
        className={`flex items-center gap-3 px-2 py-2.5 rounded-lg transition-colors ${
          active
            ? "text-primary font-medium bg-primary/8"
            : "text-muted-foreground hover:text-foreground hover:bg-muted"
        }`}
      >
        <div className="relative shrink-0">
          <item.icon className="w-5 h-5" />
          {badge > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center leading-none">
              {badge > 9 ? "9+" : badge}
            </span>
          )}
        </div>
        <span className="hidden sm:block text-sm truncate">{item.label}</span>
      </Link>
    );
  };

  const labelClass = showLabels ? "hidden sm:block" : "hidden";

  return (
    <nav
      className={`fixed top-0 left-0 h-full z-40 flex flex-col transition-[width] duration-200 ${widthClass}`}
      style={{ backgroundColor: "var(--color-nav)" }}
    >
      <Link
        href="/app"
        title="Home"
        className="flex items-center gap-2 px-2 py-3 shrink-0 rounded-lg hover:bg-muted/60 transition-colors"
      >
        <img src="/logo.png" alt="Choc-collab — home" className="w-9 h-9 shrink-0 rounded object-contain" />
        <span className={`${labelClass} text-sm font-semibold text-foreground truncate`}>Choc-collab</span>
      </Link>

      {/* Floating collapse toggle — half-overhangs the nav's right edge.
          Desktop only; mobile is always narrow. */}
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        title={collapsed ? "Expand nav" : "Collapse nav"}
        aria-label={collapsed ? "Expand nav" : "Collapse nav"}
        className="hidden sm:flex absolute top-5 -right-3 z-50 w-6 h-6 items-center justify-center rounded-full bg-card border border-border text-muted-foreground hover:text-foreground hover:border-foreground transition-colors"
      >
        <ChevronIcon className={`w-3 h-3 transition-transform ${collapsed ? "rotate-180" : ""}`} />
      </button>

      <div className="flex flex-col gap-1 p-2 pt-4 flex-1">
        {activeSection ? (
          <>
            {/* Home — always available so testers can return to the main menu */}
            <Link
              href="/app"
              title="Main menu"
              className="flex items-center gap-3 px-2 py-2.5 rounded-lg transition-colors text-muted-foreground hover:text-foreground hover:bg-muted"
            >
              <HomeIcon className="w-5 h-5 shrink-0" />
              <span className={`${labelClass} text-sm truncate`}>Main menu</span>
            </Link>
            {/* Section label */}
            <span className={`${labelClass} px-2 pt-3 pb-1 text-xs font-semibold text-muted-foreground/60 uppercase tracking-wide truncate`}>
              {activeSection.label}
            </span>
            {/* Section sub-items */}
            {activeSection.items.map(renderItem)}
          </>
        ) : (
          HOME_ITEMS.map(renderItem)
        )}
        {/* Shopping — always pinned at bottom of top block */}
        <div className="mt-auto pt-4">
          <Link
            href="/shopping"
            className={`flex items-center gap-3 px-2 py-2.5 rounded-lg transition-colors ${
              isActive(pathname, "/shopping")
                ? "text-primary font-medium bg-primary/8"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            <div className="relative shrink-0">
              <ShoppingIcon className="w-5 h-5" />
              {pendingShoppingCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center leading-none">
                  {pendingShoppingCount > 9 ? "9+" : pendingShoppingCount}
                </span>
              )}
            </div>
            <span className={`${labelClass} text-sm truncate`}>Shopping</span>
          </Link>
        </div>
      </div>
      <div className="flex flex-col gap-1 p-2 pb-4">
        <SyncStatusLink labelClass={labelClass} />
        <Link
          href="/getting-started"
          title="Documentation"
          className="flex items-center gap-3 px-2 py-2.5 rounded-lg transition-colors text-muted-foreground hover:text-foreground hover:bg-muted"
        >
          <BookIcon className="w-5 h-5 shrink-0" />
          <span className={`${labelClass} text-sm truncate`}>Docs</span>
        </Link>
        <Link
          href="/settings"
          className={`flex items-center gap-3 px-2 py-2.5 rounded-lg transition-colors ${
            pathname.startsWith("/settings")
              ? "text-primary font-medium bg-primary/8"
              : "text-muted-foreground hover:text-foreground hover:bg-muted"
          }`}
        >
          <SettingsIcon className="w-5 h-5 shrink-0" />
          <span className={`${labelClass} text-sm truncate`}>Settings</span>
        </Link>
      </div>
    </nav>
  );
}

function CloudOffIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15a4.5 4.5 0 0 0 4.5 4.5H18a3.75 3.75 0 0 0 1.332-7.257 3 3 0 0 0-3.758-3.848 5.25 5.25 0 0 0-10.233 2.33A4.502 4.502 0 0 0 2.25 15Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18" />
    </svg>
  );
}

function SyncStatusLink({ labelClass }: { labelClass: string }) {
  const currentUser = useObservable(db.cloud.currentUser);
  const isLoggedIn = currentUser?.isLoggedIn ?? false;
  const [confirming, setConfirming] = useState(false);

  if (!isCloudConfigured) {
    return (
      <div
        title="Running locally — data stays in this browser."
        className="flex items-center gap-3 px-2 py-2.5 rounded-lg text-muted-foreground"
      >
        <CloudOffIcon className="w-5 h-5 shrink-0" />
        <span className={`${labelClass} text-sm truncate`}>Local only</span>
      </div>
    );
  }

  if (!isLoggedIn) return null;

  if (confirming) {
    return (
      <div className="px-2 py-2 rounded-lg bg-muted text-sm space-y-2">
        <p className="text-foreground">Sign out of {currentUser?.email}?</p>
        <p className="text-xs text-muted-foreground">
          Any unsynced changes will stay on this device until you sign in again.
        </p>
        <div className="flex items-center gap-3 text-xs">
          <button
            type="button"
            onClick={() => { setConfirming(false); db.cloud.logout(); }}
            className="text-red-600 font-medium hover:underline"
          >
            Yes, sign out
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="text-muted-foreground hover:underline"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      title={`Signed in as ${currentUser?.email} — click to sign out`}
      className="flex items-center gap-3 px-2 py-2.5 rounded-lg transition-colors text-muted-foreground hover:text-foreground hover:bg-muted w-full text-left"
    >
      <LogOutIcon className="w-5 h-5 shrink-0" />
      <span className={`${labelClass} text-sm truncate`}>
        {currentUser?.email ?? "Sign out"}
      </span>
    </button>
  );
}

function LogOutIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
    </svg>
  );
}

/* --- Icons --- */

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
    </svg>
  );
}

function HomeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
    </svg>
  );
}

function PantryIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
    </svg>
  );
}

function ObservatoryIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
    </svg>
  );
}

function StatsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
    </svg>
  );
}

function WorkshopIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2m-6 9 2 2 4-4" />
    </svg>
  );
}

function FlaskIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 0 1-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 0 1 4.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15M14.25 3.104c.251.023.501.05.75.082M19.8 15a2.25 2.25 0 0 1 .45 1.318 2.25 2.25 0 0 1-2.25 2.25H5.25a2.25 2.25 0 0 1-2.25-2.25 2.25 2.25 0 0 1 .45-1.318L5 14.5m14.8.5H4.2" />
    </svg>
  );
}

function ShopIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 0 0 3 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 0 0 5.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 0 0 9.568 3Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6Z" />
    </svg>
  );
}

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    </svg>
  );
}

function ProductsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
    </svg>
  );
}

function FillingsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.429 9.75 2.25 12l4.179 2.25m0-4.5 5.571 3 5.571-3m-11.142 0L2.25 7.5 12 2.25l9.75 5.25-4.179 2.25m0 0L21.75 12l-4.179 2.25m0 0L12 17.25 6.429 14.25m11.142 0 4.179 2.25L12 21.75l-9.75-5.25 4.179-2.25" />
    </svg>
  );
}

function IngredientsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.362 5.214A8.252 8.252 0 0 1 12 21 8.25 8.25 0 0 1 6.038 7.047 8.287 8.287 0 0 0 9 9.601a8.983 8.983 0 0 1 3.361-6.867 8.21 8.21 0 0 0 3 2.48Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18a3.75 3.75 0 0 0 .495-7.468 5.99 5.99 0 0 0-1.925 3.547 5.975 5.975 0 0 1-2.133-1.001A3.75 3.75 0 0 0 12 18Z" />
    </svg>
  );
}

function MouldsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25a2.25 2.25 0 0 1-2.25-2.25v-2.25Z" />
    </svg>
  );
}

function PackagingIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
    </svg>
  );
}

function CollectionsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 6.878V6a2.25 2.25 0 0 1 2.25-2.25h7.5A2.25 2.25 0 0 1 18 6v.878m-12 0c.235-.083.487-.128.75-.128h10.5c.263 0 .515.045.75.128m-12 0A2.25 2.25 0 0 0 4.5 9v.878m13.5-3A2.25 2.25 0 0 1 19.5 9v.878m0 0a2.246 2.246 0 0 0-.75-.128H5.25c-.263 0-.515.045-.75.128m15 0A2.25 2.25 0 0 1 21 12v6a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 18v-6c0-1.243 1.007-2.25 2.25-2.25h13.5" />
    </svg>
  );
}

function DecorationNavIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.53 16.122a3 3 0 0 0-5.78 1.128 2.25 2.25 0 0 1-2.4 2.245 4.5 4.5 0 0 0 8.4-2.245c0-.399-.078-.78-.22-1.128Zm0 0a15.998 15.998 0 0 0 3.388-1.62m-5.043-.025a15.994 15.994 0 0 1 1.622-3.395m3.42 3.42a15.995 15.995 0 0 0 4.764-4.648l3.876-5.814a1.151 1.151 0 0 0-1.597-1.597L14.146 6.32a15.996 15.996 0 0 0-4.649 4.763m3.42 3.42a6.776 6.776 0 0 0-3.42-3.42" />
    </svg>
  );
}

function ProductionIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2m-6 9 2 2 4-4" />
    </svg>
  );
}

function StockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
    </svg>
  );
}

function ProductCostIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 14.25v2.25m3-4.5v4.5m3-6.75v6.75m3-9v9M6 20.25h12A2.25 2.25 0 0 0 20.25 18V6A2.25 2.25 0 0 0 18 3.75H6A2.25 2.25 0 0 0 3.75 6v12A2.25 2.25 0 0 0 6 20.25Z" />
    </svg>
  );
}

function ShopInsightsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 1 0-7.5 0v4.5m11.356-1.993 1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 0 1-1.12-1.243l1.264-12A1.125 1.125 0 0 1 5.513 7.5h12.974c.576 0 1.059.435 1.119 1.007ZM8.625 10.5a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm7.5 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
    </svg>
  );
}

function PricingIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" />
    </svg>
  );
}

function ShoppingIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 0 0-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 0 0-16.536-1.84M7.5 14.25 5.106 5.272M6 20.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm12.75 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z" />
    </svg>
  );
}

function BookIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
    </svg>
  );
}
