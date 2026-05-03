"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import {
  useProductsList,
  useFillings,
  useIngredients,
  useMouldsList,
  useProductionPlans,
} from "@/lib/hooks";

const MAX_PER_GROUP = 5;

interface ResultItem {
  id: string;
  name: string;
  href: string;
  detail?: string;
}

interface ResultGroups {
  products: ResultItem[];
  fillings: ResultItem[];
  ingredients: ResultItem[];
  moulds: ResultItem[];
  batches: ResultItem[];
}

/** Inline universal search across the main entity types. Lives in the
 *  /today header, replacing the previous Quick add menu. The dropdown is
 *  pure CSS-positioned (absolute) so the tile row below doesn't shift when
 *  it opens. ⌘K / Ctrl+K focuses the input from anywhere on the page;
 *  Escape clears + closes; clicking outside closes.
 *
 *  Substring match (case-insensitive) on `name`. Results grouped by entity
 *  type, capped at MAX_PER_GROUP per group, with the entity's status as
 *  inline detail where available (low/gone for products, draft/active/done
 *  for plans). */
export function UniversalSearch() {
  const products = useProductsList();
  const fillings = useFillings();
  const ingredients = useIngredients();
  const moulds = useMouldsList();
  const plans = useProductionPlans();

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // ⌘K / Ctrl+K to focus from anywhere; Esc to clear+close when focused.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
        setOpen(true);
      } else if (e.key === "Escape" && document.activeElement === inputRef.current) {
        setQuery("");
        setOpen(false);
        inputRef.current?.blur();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const groups: ResultGroups | null = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    function bySubstring<T extends { id?: string; name: string }>(items: readonly T[]): T[] {
      return items
        .filter((i) => i.id && i.name.toLowerCase().includes(q))
        .sort((a, b) => a.name.localeCompare(b.name))
        .slice(0, MAX_PER_GROUP);
    }
    return {
      products: bySubstring(products).map((p) => ({
        id: p.id!,
        name: p.name,
        href: `/products/${p.id}`,
      })),
      fillings: bySubstring(fillings).map((f) => ({
        id: f.id!,
        name: f.name,
        href: `/fillings/${f.id}`,
        detail: f.category,
      })),
      ingredients: bySubstring(ingredients).map((i) => ({
        id: i.id!,
        name: i.name,
        href: `/ingredients/${i.id}`,
        detail: i.category,
      })),
      moulds: bySubstring(moulds).map((m) => ({
        id: m.id!,
        name: m.name,
        href: `/moulds/${m.id}`,
      })),
      batches: plans
        .filter((p) => p.id && p.name.toLowerCase().includes(q))
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, MAX_PER_GROUP)
        .map((p) => ({
          id: p.id!,
          name: p.name,
          href: `/production/${p.id}`,
          detail: p.status,
        })),
    };
  }, [query, products, fillings, ingredients, moulds, plans]);

  const totalResults = groups
    ? groups.products.length + groups.fillings.length + groups.ingredients.length + groups.moulds.length + groups.batches.length
    : 0;

  function closeAndReset() {
    setQuery("");
    setOpen(false);
  }

  return (
    <div ref={wrapperRef} className="relative w-full sm:w-80 md:w-96">
      <div className={`flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 transition-colors ${
        open ? "border-foreground" : "border-border"
      }`}>
        <Search className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden />
        <input
          ref={inputRef}
          type="search"
          placeholder="Search products, fillings, ingredients…"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          aria-label="Universal search"
          className="flex-1 min-w-0 bg-transparent text-sm focus:outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:appearance-none"
        />
        {query ? (
          <button
            type="button"
            onClick={closeAndReset}
            aria-label="Clear search"
            className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        ) : (
          <span className="text-[10px] font-mono text-muted-foreground border border-border rounded px-1.5 py-0.5 shrink-0">
            ⌘K
          </span>
        )}
      </div>

      {open && groups && (
        <div
          role="listbox"
          aria-label="Search results"
          className="absolute left-0 right-0 top-full mt-1.5 z-30 max-h-[60vh] overflow-y-auto rounded-md border border-border bg-card shadow-lg"
        >
          {totalResults === 0 ? (
            <p className="text-sm text-muted-foreground px-4 py-6 text-center">No matches.</p>
          ) : (
            <div className="py-1">
              <ResultGroup label="Products" items={groups.products} onSelect={closeAndReset} />
              <ResultGroup label="Fillings" items={groups.fillings} onSelect={closeAndReset} />
              <ResultGroup label="Ingredients" items={groups.ingredients} onSelect={closeAndReset} />
              <ResultGroup label="Moulds" items={groups.moulds} onSelect={closeAndReset} />
              <ResultGroup label="Batches" items={groups.batches} onSelect={closeAndReset} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ResultGroup({
  label,
  items,
  onSelect,
}: {
  label: string;
  items: ResultItem[];
  onSelect: () => void;
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <div className="mono-label text-muted-foreground px-3 pt-2 pb-1">{label}</div>
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            <Link
              href={item.href}
              onClick={onSelect}
              className="flex items-baseline gap-2 px-3 py-1.5 text-sm hover:bg-muted focus:bg-muted focus:outline-none transition-colors"
            >
              <span className="flex-1 min-w-0 truncate">{item.name}</span>
              {item.detail && (
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground shrink-0">
                  {item.detail}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
