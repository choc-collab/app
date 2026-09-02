"use client";

import Link from "next/link";
import { useProductionPlans } from "@/lib/hooks";
import { useMemo } from "react";

const CARDS = [
  {
    name: "Production Plan",
    description: "Create and run production batches, check off steps as you go.",
    href: "/production",
    icon: ClipboardIcon,
    enabled: true,
  },
  {
    name: "Stock",
    description: "Track finished batches, sell-before dates, and inventory.",
    href: "/stock",
    icon: StockIcon,
    enabled: true,
  },
] as const;

function WorkshopHint() {
  const plans = useProductionPlans();
  const active = useMemo(
    () => plans.filter((p) => p.status === "active" || p.status === "draft"),
    [plans]
  );
  if (plans.length === 0) return null;
  if (active.length === 0) return <span>No batches right now — start a new one?</span>;
  const activeCount = active.filter((p) => p.status === "active").length;
  const draftCount = active.filter((p) => p.status === "draft").length;
  const parts: string[] = [];
  if (activeCount > 0) parts.push(`${activeCount} batch${activeCount > 1 ? "es" : ""} in progress`);
  if (draftCount > 0) parts.push(`${draftCount} waiting to start`);
  return <span>{parts.join(", ")}</span>;
}

export default function WorkshopPage() {
  return (
    <div className="p-6 max-w-2xl">
      <h1 className="font-[family-name:var(--font-display)] text-2xl sm:text-3xl text-foreground mb-1">
        The Workshop
      </h1>
      <p className="text-muted-foreground mb-2">
        Run production batches, check off steps, and track your stock.
      </p>
      <div className="text-xs text-muted-foreground/70 mb-8 min-h-[1.25rem]">
        <WorkshopHint />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {CARDS.map((card) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.name}
              href={card.href}
              className="flex flex-col bg-card border border-border rounded-lg p-5 transition-shadow hover:shadow-md hover:border-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <div className="flex items-center gap-3 mb-3">
                <Icon className="w-6 h-6 text-primary" />
                <h2 className="font-[family-name:var(--font-display)] text-lg">{card.name}</h2>
              </div>
              <p className="text-sm text-muted-foreground flex-1">{card.description}</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

/* --- Icons --- */

function ClipboardIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2m-6 9 2 2 4-4" />
    </svg>
  );
}

function StockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
    </svg>
  );
}
