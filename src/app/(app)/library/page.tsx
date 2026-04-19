"use client";

import Link from "next/link";
import { useProductsList, useFillings, useIngredients } from "@/lib/hooks";

const CARDS = [
  {
    name: "Products",
    description: "Your product catalog — bonbons, bars, truffles and more.",
    href: "/products",
    icon: BookIcon,
    enabled: true,
  },
  {
    name: "Fillings",
    description: "Reusable fillings: ganaches, pralines, caramels, and more.",
    href: "/fillings",
    icon: FillingsIcon,
    enabled: true,
  },
  {
    name: "Ingredients",
    description: "Your ingredient library with costs, allergens and composition.",
    href: "/ingredients",
    icon: LeafIcon,
    enabled: true,
  },
  {
    name: "Moulds",
    description: "Polycarbonate moulds, cavity volumes, and quantities.",
    href: "/moulds",
    icon: GridIcon,
    enabled: true,
  },
  {
    name: "Packaging",
    description: "Box sizes, inserts, and packaging materials.",
    href: "/packaging",
    icon: PackageIcon,
    enabled: true,
  },
  {
    name: "Collections",
    description: "Curated sets of products for seasonal or themed boxes.",
    href: "/collections",
    icon: CollectionIcon,
    enabled: true,
  },
] as const;

function LibraryHint() {
  const products = useProductsList();
  const fillings = useFillings();
  const ingredients = useIngredients();
  if (products.length === 0 && fillings.length === 0) return null;
  const parts: string[] = [];
  if (products.length > 0) parts.push(`${products.length} product${products.length !== 1 ? "s" : ""}`);
  if (fillings.length > 0) parts.push(`${fillings.length} filling${fillings.length !== 1 ? "s" : ""}`);
  if (ingredients.length > 0) parts.push(`${ingredients.length} ingredient${ingredients.length !== 1 ? "s" : ""}`);
  return <span>{parts.join(", ")} in your library</span>;
}

export default function LibraryPage() {
  return (
    <div className="p-6 max-w-2xl">
      <h1 className="font-[family-name:var(--font-display)] text-2xl sm:text-3xl text-foreground mb-1">
        The Library
      </h1>
      <p className="text-muted-foreground mb-2">
        Your products, fillings, ingredients, and moulds — all in one place.
      </p>
      <div className="text-xs text-muted-foreground/70 mb-8 min-h-[1.25rem]">
        <LibraryHint />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {CARDS.map((card) => {
          const Icon = card.icon;
          const inner = (
            <>
              <div className="flex items-center gap-3 mb-3">
                <Icon className="w-6 h-6 text-primary" />
                <h2 className="font-[family-name:var(--font-display)] text-lg">{card.name}</h2>
              </div>
              <p className="text-sm text-muted-foreground flex-1">{card.description}</p>
            </>
          );

          if (!card.enabled) {
            return (
              <div
                key={card.name}
                className="flex flex-col border border-border border-dashed rounded-lg p-5 opacity-50"
              >
                {inner}
                <div className="text-xs text-muted-foreground/70 mt-4">Coming soon</div>
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

/* --- Icons --- */

function BookIcon({ className }: { className?: string }) {
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

function LeafIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.362 5.214A8.252 8.252 0 0 1 12 21 8.25 8.25 0 0 1 6.038 7.047 8.287 8.287 0 0 0 9 9.601a8.983 8.983 0 0 1 3.361-6.867 8.21 8.21 0 0 0 3 2.48Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18a3.75 3.75 0 0 0 .495-7.468 5.99 5.99 0 0 0-1.925 3.547 5.975 5.975 0 0 1-2.133-1.001A3.75 3.75 0 0 0 12 18Z" />
    </svg>
  );
}

function GridIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25a2.25 2.25 0 0 1-2.25-2.25v-2.25Z" />
    </svg>
  );
}

function PackageIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="m21 7.5-9-5.25L3 7.5m18 0-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
    </svg>
  );
}

function CollectionIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 6.878V6a2.25 2.25 0 0 1 2.25-2.25h7.5A2.25 2.25 0 0 1 18 6v.878m-12 0c.235-.083.487-.128.75-.128h10.5c.263 0 .515.045.75.128m-12 0A2.25 2.25 0 0 0 4.5 9v.878m13.5-3A2.25 2.25 0 0 1 19.5 9v.878m0 0a2.246 2.246 0 0 0-.75-.128H5.25c-.263 0-.515.045-.75.128m15 0A2.25 2.25 0 0 1 21 12v6a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 18v-6c0-1.243 1.007-2.25 2.25-2.25h13.5" />
    </svg>
  );
}
