"use client";

import { useMemo } from "react";
import { BonbonDisc } from "./bonbon-disc";
import type { ShopProductInfo } from "@/lib/shopColor";
import type { Product } from "@/types";

/**
 * The right-rail palette for both the paid-sale fill-box flow and the
 * give-away box-mode picker.
 *
 * Props are deliberately fully controlled (query / category live in the
 * parent) so each call site can persist them in its own draft / session
 * state without the palette having to know about either flow.
 *
 * Visuals follow the design handoff: search input with magnifier, horizontal
 * category chip row, then a 2/3-column tile grid. The accent (cocoa for
 * sales, lilac for give-aways) is parameterised so the active chip + tile
 * tint match the surrounding route accent.
 */
export interface BonbonPaletteProps {
  /** Products to render. The caller filters out anything that shouldn't
   *  appear (archived rows, wrong kinds for the mode, etc.). */
  catalog: readonly Omit<Product, "photo">[];
  productInfoById: Map<string, ShopProductInfo>;
  /** productId → category name. Used to filter by category and to derive
   *  the chip row. Caller passes whatever map is already built. */
  categoryByProductId: ReadonlyMap<string, string | undefined>;
  /** productId → pieces already used in the active draft. Subtracted from
   *  stock for the "X left" caption when `fromStock=true`. */
  usedCounts: ReadonlyMap<string, number>;
  /** productId → available stock (live aggregate from done plans). */
  stockMap: ReadonlyMap<string, number>;
  /** When true, tiles disable when `stock - used <= 0`. When false, the
   *  picker doesn't gate on stock — the give-away off-stock flow uses this
   *  to allow logging fresh-made pieces that never entered finished stock. */
  fromStock: boolean;
  /** When false, every tile is disabled with a tooltip nudging the user to
   *  pick a cavity first. Used by box mode where a pick has no destination
   *  until a cavity is active. */
  canPick: boolean;
  onPick: (productId: string) => void;

  /** Search query (controlled). */
  query: string;
  onQueryChange: (next: string) => void;
  /** Category name (controlled). Empty string means "All". */
  category: string;
  onCategoryChange: (next: string) => void;

  /** Pastel accent for the active category chip. Defaults to "cocoa". */
  accent?: "cocoa" | "lilac";
  /** Override the column count. Defaults to 2 for small catalogs, 3 for >20. */
  columns?: 2 | 3;
  /** Override the bonbon disc tile size. Defaults to 44 for small, 34 for >20. */
  tileSize?: number;
  /** Custom empty state when the catalog is empty (e.g. a "Add products"
   *  CTA on the paid-sale flow). When omitted, a generic message is shown. */
  emptyState?: React.ReactNode;
}

const ALL_CATEGORY = "All";

export function BonbonPalette({
  catalog,
  productInfoById,
  categoryByProductId,
  usedCounts,
  stockMap,
  fromStock,
  canPick,
  onPick,
  query,
  onQueryChange,
  category,
  onCategoryChange,
  accent = "cocoa",
  columns,
  tileSize,
  emptyState,
}: BonbonPaletteProps) {
  const cols = columns ?? (catalog.length > 20 ? 3 : 2);
  const size = tileSize ?? (catalog.length > 20 ? 34 : 44);

  const categoryNames = useMemo(() => {
    const names = new Set<string>();
    for (const p of catalog) {
      if (!p.id) continue;
      const cat = categoryByProductId.get(p.id);
      if (cat) names.add(cat);
    }
    return [ALL_CATEGORY, ...Array.from(names).sort()];
  }, [catalog, categoryByProductId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return catalog.filter((p) => {
      if (category && category !== ALL_CATEGORY) {
        const cat = p.id ? categoryByProductId.get(p.id) : undefined;
        if (cat !== category) return false;
      }
      if (q && !p.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [catalog, query, category, categoryByProductId]);

  const accentBg = accent === "lilac" ? "var(--accent-lilac-bg)" : "var(--accent-cocoa-bg)";
  const accentInk = accent === "lilac" ? "var(--accent-lilac-ink)" : "var(--accent-cocoa-ink)";
  const isAllActive = category === "" || category === ALL_CATEGORY;

  return (
    <div className="flex flex-col min-h-0 h-full">
      <div className="p-3.5 pb-2">
        <div className="flex items-baseline justify-between mb-2">
          <div className="text-xs font-mono uppercase tracking-wide text-muted-foreground">Bonbons</div>
          <div className="text-xs font-mono text-muted-foreground">
            {filtered.length}/{catalog.length}
          </div>
        </div>

        <div className="relative mb-2">
          <input
            type="search"
            className="input w-full text-sm"
            placeholder="Search…"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            data-testid="shop-palette-search"
            // .input's shorthand `padding` overrides Tailwind's `pl-*`; set
            // the left padding inline so the icon clears the placeholder.
            style={{ paddingLeft: 28 }}
          />
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
        </div>

        <div
          className="flex gap-1 overflow-x-auto pb-1 -mx-0.5 px-0.5"
          style={{ scrollbarWidth: "none" }}
        >
          {categoryNames.map((c) => {
            const isAll = c === ALL_CATEGORY;
            const active = isAll ? isAllActive : c === category;
            return (
              <button
                key={c}
                type="button"
                onClick={() => onCategoryChange(isAll ? "" : c)}
                className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium ${
                  active ? "" : "border border-border text-muted-foreground hover:text-foreground"
                }`}
                style={active ? { background: accentBg, color: accentInk } : undefined}
              >
                {c}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {catalog.length === 0 ? (
          emptyState ?? <DefaultEmptyPalette />
        ) : filtered.length === 0 ? (
          <div className="py-6 text-center text-xs text-muted-foreground">No bonbons match.</div>
        ) : (
          <div
            className="grid gap-2"
            style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
          >
            {filtered.map((p) => (
              <PaletteTile
                key={p.id}
                product={p}
                info={p.id ? productInfoById.get(p.id) : undefined}
                available={p.id ? stockMap.get(p.id) ?? 0 : 0}
                used={p.id ? usedCounts.get(p.id) ?? 0 : 0}
                tileSize={size}
                onPick={onPick}
                canPick={canPick}
                fromStock={fromStock}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PaletteTile({
  product,
  info,
  available,
  used,
  tileSize,
  onPick,
  canPick,
  fromStock,
}: {
  product: Omit<Product, "photo">;
  info: ShopProductInfo | undefined;
  available: number;
  used: number;
  tileSize: number;
  onPick: (productId: string) => void;
  canPick: boolean;
  fromStock: boolean;
}) {
  const remaining = available - used;
  const out = fromStock && remaining <= 0;
  const low = fromStock && remaining > 0 && remaining <= 3;
  const disabled = out || !canPick;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => product.id && onPick(product.id)}
      className="rounded-lg border border-border bg-card px-1.5 py-2 flex flex-col items-center gap-1 transition-all hover:border-primary/40 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      data-testid="shop-palette-tile"
      data-product-id={product.id}
      title={!canPick && !out ? "Select a cavity first" : undefined}
    >
      <BonbonDisc info={info} size={tileSize} />
      <div className="text-[10px] font-medium leading-tight text-center line-clamp-2 min-h-[1.4em]">
        {product.name}
      </div>
      <div
        className="text-[9px] font-mono"
        style={{
          color: out
            ? "var(--color-status-alert, #8c3030)"
            : low
              ? "var(--color-status-warn, #7a5c08)"
              : "var(--color-muted-foreground)",
        }}
      >
        {fromStock ? (out ? "out" : `${remaining} left`) : "fresh"}
      </div>
    </button>
  );
}

function DefaultEmptyPalette() {
  return (
    <div className="py-8 text-center text-xs text-muted-foreground">
      No bonbons in the catalog yet.
    </div>
  );
}
