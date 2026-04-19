"use client";

import Link from "next/link";
import { useProductionPlans, useProductsList, usePendingShoppingCount } from "@/lib/hooks";
import { useMemo, useState, useEffect } from "react";

function useGreeting() {
  const [greeting, setGreeting] = useState("");
  useEffect(() => {
    const h = new Date().getHours();
    if (h >= 5 && h < 12) setGreeting("Good morning");
    else if (h >= 12 && h < 17) setGreeting("Good afternoon");
    else if (h >= 17 && h < 24) setGreeting("Evening");
    else setGreeting("Working late");
  }, []);
  return greeting;
}

function WorkshopHint() {
  const plans = useProductionPlans();
  const active = useMemo(
    () => plans.filter((p) => p.status === "active" || p.status === "draft"),
    [plans]
  );
  if (plans.length === 0) return null; // still loading or truly empty — show nothing during load
  if (active.length === 0) return <span>No batches right now — start a new one?</span>;
  const activeCount = active.filter((p) => p.status === "active").length;
  const draftCount = active.filter((p) => p.status === "draft").length;
  const parts: string[] = [];
  if (activeCount > 0) parts.push(`${activeCount} batch${activeCount > 1 ? "es" : ""} in progress`);
  if (draftCount > 0) parts.push(`${draftCount} waiting to start`);
  return <span>{parts.join(", ")}</span>;
}


function PantryHint() {
  const products = useProductsList();
  if (products.length === 0) return null;
  return <span>{products.length} product{products.length !== 1 ? "s" : ""} in your pantry</span>;
}

function ObservatoryHint() {
  const plans = useProductionPlans();
  const done = useMemo(() => plans.filter((p) => p.status === "done").length, [plans]);
  if (done === 0) return null;
  return <span>{done} completed batch{done !== 1 ? "es" : ""} to explore</span>;
}

const CARDS = [
  {
    name: "The Workshop",
    description: "Run production batches, check off steps, track your stock.",
    href: "/workshop",
    hint: WorkshopHint,
    icon: WorkshopIcon,
    enabled: true,
  },
  {
    name: "The Pantry",
    description: "Your products, fillings, ingredients, and materials — all in one place.",
    href: "/pantry",
    hint: PantryHint,
    icon: PantryIcon,
    enabled: true,
  },
  {
    name: "The Lab",
    description: "Experiment with ganache formulations and balance ratios.",
    href: "/lab",
    hint: () => <span>Coming soon</span>,
    icon: LabIcon,
    enabled: false,
  },
  {
    name: "The Observatory",
    description: "Margins, production trends, and collection performance over time.",
    href: "/observatory",
    hint: ObservatoryHint,
    icon: ObservatoryIcon,
    enabled: true,
  },
  {
    name: "The Shop",
    description: "Build a custom box, print labels with allergens and nutritional values.",
    href: "/shop",
    hint: () => <span>Coming soon</span>,
    icon: ShopIcon,
    enabled: false,
  },
] as const;

function ShoppingCallout() {
  const count = usePendingShoppingCount();
  if (count === 0) return null;
  return (
    <Link
      href="/shopping"
      className="flex items-center gap-2 rounded-lg border border-status-warn-edge bg-status-warn-bg px-3 py-2.5 mb-6 text-sm text-status-warn hover:bg-status-warn-bg transition-colors"
    >
      <ShoppingCartIcon className="w-4 h-4 shrink-0 text-status-warn" />
      <span className="flex-1">
        <span className="font-medium">{count} item{count !== 1 ? "s" : ""}</span> on your shopping list
      </span>
      <span className="text-status-warn text-xs">Order →</span>
    </Link>
  );
}

export default function Home() {
  const greeting = useGreeting();

  return (
    <div className="p-6 max-w-2xl">
      {/* Greeting */}
      <h1 className="font-[family-name:var(--font-display)] text-2xl sm:text-3xl text-foreground mb-1">
        {greeting || "\u00A0"}
      </h1>
      <p className="text-muted-foreground mb-6">What are we up to today?</p>

      <ShoppingCallout />

      {/* Mode cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {CARDS.map((card) => {
          const Hint = card.hint;
          const Icon = card.icon;
          const inner = (
            <>
              <div className="flex items-center gap-3 mb-3">
                <Icon className="w-6 h-6 text-primary" />
                <h2 className="font-[family-name:var(--font-display)] text-lg">{card.name}</h2>
              </div>
              <p className="text-sm text-muted-foreground mb-4 flex-1">{card.description}</p>
              <div className="text-xs text-muted-foreground/70 min-h-[1.25rem]">
                <Hint />
              </div>
            </>
          );

          if (!card.enabled) {
            return (
              <div
                key={card.name}
                className="flex flex-col border border-border border-dashed rounded-lg p-5 opacity-50"
              >
                {inner}
              </div>
            );
          }

          return (
            <Link
              key={card.name}
              href={card.href}
              className="flex flex-col bg-card border border-border rounded-lg p-5 transition-shadow hover:shadow-md hover:border-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {inner}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

/* --- Icons (matching the hand-drawn SVG style used in side-nav) --- */

function WorkshopIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2m-6 9 2 2 4-4" />
    </svg>
  );
}

function LabIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 0 1-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 0 1 4.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15M14.25 3.104c.251.023.501.05.75.082M19.8 15a2.25 2.25 0 0 1 .45 1.318 2.25 2.25 0 0 1-2.25 2.25H5.25a2.25 2.25 0 0 1-2.25-2.25 2.25 2.25 0 0 1 .45-1.318L5 14.5m14.8.5H4.2" />
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

function ShopIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 0 0 3 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 0 0 5.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 0 0 9.568 3Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6Z" />
    </svg>
  );
}

function ShoppingCartIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 0 0-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 0 0-16.536-1.84M7.5 14.25 5.106 5.272M6 20.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm12.75 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z" />
    </svg>
  );
}
