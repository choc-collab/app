"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { db } from "@/lib/db";
import { useProductsList, useMouldsList, useIngredients, useCurrencySymbol, useProductCategoryMap, useFillingCategoryMap } from "@/lib/hooks";
import { deserializeBreakdown } from "@/lib/costCalculation";
import { getProductFillingCategories, rankSimilarProducts } from "@/lib/productSimilarity";
import { PageHeader } from "@/components/page-header";
import { chipTextColor, tintBg, tintEdge, NEUTRAL_CATEGORY_HEX } from "@/lib/categoryColor";
import type { Filling, FillingCategory, ProductFilling, ProductCostSnapshot, Mould, Ingredient, BreakdownEntry } from "@/types";

// ---------------------------------------------------------------------------
// Category display helpers
// ---------------------------------------------------------------------------

const CAT_LABEL: Record<string, string> = {
  "Ganaches (Emulsions)": "Ganache",
  "Pralines & Giandujas (Nut-Based)": "Praline",
  "Caramels & Syrups (Sugar-Based)": "Caramel",
  "Fruit-Based (Pectins & Acids)": "Fruit",
  'Croustillants & Biscuits (The "Crunch" Filling)': "Crunch",
  "Shell & Cap": "Shell & Cap",
};

function shortCat(cat: string): string {
  return CAT_LABEL[cat] ?? cat;
}

// Canonical display order: Shell anchored first, then filling categories
const CATEGORY_ORDER = [
  "Shell & Cap",
  "Ganaches (Emulsions)",
  "Pralines & Giandujas (Nut-Based)",
  "Caramels & Syrups (Sugar-Based)",
  "Fruit-Based (Pectins & Acids)",
  'Croustillants & Biscuits (The "Crunch" Filling)',
];

const SHELL_CATEGORY = "Shell & Cap";

/** Returns an inline CSS color for the shell bar segment based on coating type.
 *  Shell & Cap is not a configurable FillingCategory — it derives its colour
 *  from the product's `coating` (Dark/Milk/White/Ruby) so the bar segment
 *  visually matches the chocolate. Returns undefined when the coating doesn't
 *  match a known type, in which case the caller falls back to a neutral grey. */
function getShellColor(coatingName?: string): string | undefined {
  const n = (coatingName ?? "").toLowerCase();
  if (n.includes("dark") || n.includes("noir") || n.includes("bitter")) return "#3d1a0a";
  if (n.includes("milk") || n.includes("lait")) return "#8b5e3c";
  if (n.includes("white") || n.includes("blanc") || n.includes("blond")) return "#d4aa6a";
  if (n.includes("ruby")) return "#b04060";
  return undefined;
}

/** Resolve a category name to the user-configured hex from the live category
 *  map. Shell & Cap is opaque to the FillingCategory table — callers that need
 *  the per-coating shell colour pass `shellColor` themselves. Unknown / unset
 *  categories fall back to a neutral grey so the bar always renders. */
function resolveCategoryHex(
  cat: string,
  categoryMap: Map<string, FillingCategory>,
  shellColor?: string,
): string {
  if (cat === SHELL_CATEGORY) return shellColor ?? "#78716c"; // tailwind stone-500
  return categoryMap.get(cat)?.color ?? NEUTRAL_CATEGORY_HEX;
}

function categoryChipStyle(hex: string): React.CSSProperties {
  return {
    color: chipTextColor(hex),
    backgroundColor: tintBg(hex),
    borderColor: tintEdge(hex),
  };
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

interface CategoryBreakdown {
  category: string;
  subtotal: number;
}

function getCategoryBreakdown(
  snapshot: ProductCostSnapshot,
  fillingsMap: Map<string, Filling>,
): CategoryBreakdown[] {
  const entries: BreakdownEntry[] = deserializeBreakdown(snapshot.breakdown);
  const byCategory = new Map<string, number>();

  for (const entry of entries) {
    let cat: string;
    if (entry.kind === "shell" || entry.kind === "cap") {
      cat = "Shell & Cap";
    } else {
      const filling = entry.fillingId ? fillingsMap.get(entry.fillingId) : undefined;
      cat = filling?.category ?? "Other";
    }
    byCategory.set(cat, (byCategory.get(cat) ?? 0) + entry.subtotal);
  }

  return [...byCategory.entries()]
    .map(([category, subtotal]) => ({ category, subtotal }))
    .sort((a, b) => {
      const ai = CATEGORY_ORDER.indexOf(a.category);
      const bi = CATEGORY_ORDER.indexOf(b.category);
      if (ai === -1 && bi === -1) return b.subtotal - a.subtotal;
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
}

interface SharedIngredient {
  ingredientId: string;
  name: string;
  subtotals: (number | null)[];
}

function getSharedIngredients(
  allIds: string[],
  latestSnapshotByProduct: Map<string, ProductCostSnapshot>,
  ingredientsMap: Map<string, Ingredient>,
): SharedIngredient[] {
  const byIngredient = new Map<string, (number | null)[]>();

  allIds.forEach((productId, idx) => {
    const snap = latestSnapshotByProduct.get(productId);
    if (!snap) return;
    const entries: BreakdownEntry[] = deserializeBreakdown(snap.breakdown);
    for (const entry of entries) {
      if (entry.kind !== "filling_ingredient" || !entry.ingredientId) continue;
      if (!byIngredient.has(entry.ingredientId)) {
        byIngredient.set(entry.ingredientId, new Array(allIds.length).fill(null));
      }
      const arr = byIngredient.get(entry.ingredientId)!;
      arr[idx] = (arr[idx] ?? 0) + entry.subtotal;
    }
  });

  return [...byIngredient.entries()]
    .filter(([, subtotals]) => subtotals.filter((v) => v !== null).length >= 2)
    .map(([ingredientId, subtotals]) => ({
      ingredientId,
      name: ingredientsMap.get(ingredientId)?.name ?? `Ingredient #${ingredientId}`,
      subtotals,
    }))
    .sort((a, b) => {
      const maxA = Math.max(...(a.subtotals.filter((v) => v !== null) as number[]));
      const maxB = Math.max(...(b.subtotals.filter((v) => v !== null) as number[]));
      return maxB - maxA;
    });
}

function fmt(n: number, sym = "€"): string {
  return `${sym}${n.toFixed(3)}`;
}

function fmtG(n: number, sym = "€"): string {
  return `${sym}${n.toFixed(4)}/g`;
}

// ---------------------------------------------------------------------------
// Stacked bar component
// ---------------------------------------------------------------------------

function CategoryBar({
  breakdown,
  total,
  shellColor,
  categoryMap,
  sym = "€",
}: {
  breakdown: CategoryBreakdown[];
  total: number;
  shellColor?: string;
  categoryMap: Map<string, FillingCategory>;
  sym?: string;
}) {
  if (total === 0) return null;
  return (
    <div className="flex h-3 rounded overflow-hidden w-full gap-px">
      {breakdown.map(({ category, subtotal }) => {
        const hex = resolveCategoryHex(category, categoryMap, shellColor);
        return (
          <div
            key={category}
            className="transition-all"
            style={{
              width: `${(subtotal / total) * 100}%`,
              backgroundColor: hex,
            }}
            title={`${shortCat(category)}: ${fmt(subtotal, sym)}`}
          />
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function ProductCostPage() {
  const products = useProductsList();
  const moulds = useMouldsList(true);
  const ingredients = useIngredients();
  const sym = useCurrencySymbol();
  const productCategoryMap = useProductCategoryMap();
  const fillingCategoryMap = useFillingCategoryMap();
  const allFillings = useLiveQuery(() => db.fillings.toArray()) ?? [];
  const allProductFillings = useLiveQuery(() => db.productFillings.toArray()) ?? [];
  const allSnapshots = useLiveQuery(() => db.productCostSnapshots.toArray()) ?? [];

  const [focusId, setFocusId] = useState<string | null>(null);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [compareSearch, setCompareSearch] = useState("");
  const [addingCompare, setAddingCompare] = useState(false);
  type SortMode =
    | "cost-asc"
    | "cost-desc"
    | "cost-per-gram-asc"
    | "cost-per-gram-desc"
    | "name";
  const [sortBy, setSortBy] = useState<SortMode>("cost-asc");
  const [fillingCatFilter, setFillingCatFilter] = useState<Set<string>>(new Set());
  const [productCatFilter, setProductCatFilter] = useState<string>("");
  const compareInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (addingCompare) compareInputRef.current?.focus();
  }, [addingCompare]);

  // ---- Maps ----
  const fillingsMap = useMemo(
    () => new Map(allFillings.map((l) => [l.id!, l])),
    [allFillings],
  );
  const mouldsMap = useMemo(
    () => new Map(moulds.map((m) => [m.id!, m])),
    [moulds],
  );
  const ingredientsMap = useMemo(
    () => new Map(ingredients.map((i) => [i.id!, i])),
    [ingredients],
  );
  const productsMap = useMemo(
    () => new Map(products.map((r) => [r.id!, r])),
    [products],
  );

  const fillingsByProduct = useMemo(() => {
    const map = new Map<string, ProductFilling[]>();
    for (const rl of allProductFillings) {
      if (!map.has(rl.productId)) map.set(rl.productId, []);
      map.get(rl.productId)!.push(rl);
    }
    return map;
  }, [allProductFillings]);

  const latestSnapshotByProduct = useMemo(() => {
    const map = new Map<string, ProductCostSnapshot>();
    for (const snap of allSnapshots) {
      const existing = map.get(snap.productId);
      if (!existing || new Date(snap.recordedAt) > new Date(existing.recordedAt)) {
        map.set(snap.productId, snap);
      }
    }
    return map;
  }, [allSnapshots]);

  // Products that have a cost snapshot, sorted cheapest first
  const productsWithCost = useMemo(
    () =>
      products
        .filter((r) => latestSnapshotByProduct.has(r.id!))
        .sort(
          (a, b) =>
            latestSnapshotByProduct.get(a.id!)!.costPerProduct -
            latestSnapshotByProduct.get(b.id!)!.costPerProduct,
        ),
    [products, latestSnapshotByProduct],
  );

  // ---- Focus product derived data ----
  const focusProduct = focusId ? productsMap.get(focusId) : undefined;
  const focusSnapshot = focusId ? latestSnapshotByProduct.get(focusId) : undefined;
  const focusMould = focusProduct?.defaultMouldId
    ? mouldsMap.get(focusProduct.defaultMouldId)
    : undefined;
  const focusProductFillings = focusId ? (fillingsByProduct.get(focusId) ?? []) : [];
  const focusCategories = useMemo(
    () => getProductFillingCategories(focusProductFillings, fillingsMap),
    [focusProductFillings, fillingsMap],
  );
  const focusCategoryBreakdown = useMemo(
    () => (focusSnapshot ? getCategoryBreakdown(focusSnapshot, fillingsMap) : []),
    [focusSnapshot, fillingsMap],
  );
  const focusCostPerGram =
    focusSnapshot && focusMould
      ? focusSnapshot.costPerProduct / focusMould.cavityWeightG
      : null;

  const rankingContext = useMemo(() => {
    if (!focusId) return null;
    const idx = productsWithCost.findIndex((r) => r.id === focusId);
    return idx === -1 ? null : { rank: idx + 1, total: productsWithCost.length };
  }, [focusId, productsWithCost]);

  // ---- Similar products ----
  // We pass productCategoryId as the productSimilarity discriminator — same-category
  // products get a small ranking bonus. The function's parameter is named `productType`
  // for historical reasons but it's just a generic string equality check.
  const similarCandidates = useMemo(() => {
    if (!focusId) return [];
    return products
      .filter((r) => r.id !== focusId && latestSnapshotByProduct.has(r.id!))
      .map((r) => ({
        productId: r.id!,
        categories: getProductFillingCategories(
          fillingsByProduct.get(r.id!) ?? [],
          fillingsMap,
        ),
        productType: r.productCategoryId,
      }));
  }, [focusId, products, latestSnapshotByProduct, fillingsByProduct, fillingsMap]);

  const similarRanked = useMemo(
    () =>
      rankSimilarProducts(
        focusCategories,
        focusProduct?.productCategoryId,
        similarCandidates,
      ).slice(0, 5),
    [focusCategories, focusProduct, similarCandidates],
  );

  // ---- Comparison ----
  const allCompareIds = useMemo(
    () => (focusId ? [focusId, ...compareIds] : []),
    [focusId, compareIds],
  );

  const compareCategoryBreakdowns = useMemo(
    () =>
      allCompareIds.map((id) => {
        const snap = latestSnapshotByProduct.get(id);
        return snap ? getCategoryBreakdown(snap, fillingsMap) : [];
      }),
    [allCompareIds, latestSnapshotByProduct, fillingsMap],
  );

  const allCompareCategories = useMemo(() => {
    const cats = new Set<string>();
    for (const bd of compareCategoryBreakdowns) {
      for (const e of bd) cats.add(e.category);
    }
    // Order: filling categories first, Shell & Cap last
    const order = [
      "Ganaches (Emulsions)",
      "Pralines & Giandujas (Nut-Based)",
      "Caramels & Syrups (Sugar-Based)",
      "Fruit-Based (Pectins & Acids)",
      'Croustillants & Biscuits (The "Crunch" Filling)',
      "Shell & Cap",
    ];
    return order.filter((c) => cats.has(c));
  }, [compareCategoryBreakdowns]);

  const sharedIngredients = useMemo(
    () =>
      allCompareIds.length >= 2
        ? getSharedIngredients(allCompareIds, latestSnapshotByProduct, ingredientsMap)
        : [],
    [allCompareIds, latestSnapshotByProduct, ingredientsMap],
  );

  // ---- Overview search / filter / sort ----
  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = productsWithCost.filter((r) => {
      if (q && !r.name.toLowerCase().includes(q)) return false;
      if (productCatFilter && r.productCategoryId !== productCatFilter) return false;
      if (fillingCatFilter.size > 0) {
        const cats = new Set(
          getProductFillingCategories(fillingsByProduct.get(r.id!) ?? [], fillingsMap),
        );
        let any = false;
        for (const c of fillingCatFilter) {
          if (cats.has(c)) { any = true; break; }
        }
        if (!any) return false;
      }
      return true;
    });

    const sorted = [...filtered];
    const costPerGramFor = (id: string): number | null => {
      const p = productsMap.get(id);
      const snap = latestSnapshotByProduct.get(id);
      const mould = p?.defaultMouldId ? mouldsMap.get(p.defaultMouldId) : undefined;
      if (!snap || !mould) return null;
      return snap.costPerProduct / mould.cavityWeightG;
    };

    switch (sortBy) {
      case "cost-asc":
        sorted.sort(
          (a, b) =>
            latestSnapshotByProduct.get(a.id!)!.costPerProduct -
            latestSnapshotByProduct.get(b.id!)!.costPerProduct,
        );
        break;
      case "cost-desc":
        sorted.sort(
          (a, b) =>
            latestSnapshotByProduct.get(b.id!)!.costPerProduct -
            latestSnapshotByProduct.get(a.id!)!.costPerProduct,
        );
        break;
      case "cost-per-gram-asc":
      case "cost-per-gram-desc": {
        const dir = sortBy === "cost-per-gram-asc" ? 1 : -1;
        sorted.sort((a, b) => {
          const av = costPerGramFor(a.id!);
          const bv = costPerGramFor(b.id!);
          if (av === null && bv === null) return 0;
          if (av === null) return 1;
          if (bv === null) return -1;
          return (av - bv) * dir;
        });
        break;
      }
      case "name":
        sorted.sort((a, b) => a.name.localeCompare(b.name));
        break;
    }
    return sorted;
  }, [
    productsWithCost,
    search,
    productCatFilter,
    fillingCatFilter,
    fillingsByProduct,
    fillingsMap,
    sortBy,
    latestSnapshotByProduct,
    productsMap,
    mouldsMap,
  ]);

  const toggleFillingCat = (cat: string) => {
    setFillingCatFilter((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  };

  const clearFilters = () => {
    setFillingCatFilter(new Set());
    setProductCatFilter("");
    setSearch("");
  };

  const availableProductCategories = useMemo(() => {
    const ids = new Set<string>();
    for (const p of productsWithCost) {
      if (p.productCategoryId) ids.add(p.productCategoryId);
    }
    return [...ids]
      .map((id) => productCategoryMap.get(id))
      .filter((c): c is NonNullable<typeof c> => !!c)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [productsWithCost, productCategoryMap]);

  const hasActiveFilters =
    !!search || !!productCatFilter || fillingCatFilter.size > 0;

  // ---- Add-compare search ----
  const compareSearchResults = useMemo(() => {
    if (!addingCompare) return [];
    const q = compareSearch.toLowerCase();
    return products
      .filter((r) => {
        if (r.id === focusId) return false;
        if (compareIds.includes(r.id!)) return false;
        if (q && !r.name.toLowerCase().includes(q)) return false;
        return true;
      })
      .slice(0, 8);
  }, [addingCompare, compareSearch, products, focusId, compareIds]);

  const addToCompare = (id: string) => {
    if (compareIds.length >= 3) return;
    setCompareIds((prev) => [...prev, id]);
    setAddingCompare(false);
    setCompareSearch("");
  };

  const removeFromCompare = (id: string) => {
    setCompareIds((prev) => prev.filter((x) => x !== id));
  };

  const clearFocus = () => {
    setFocusId(null);
    setCompareIds([]);
    setAddingCompare(false);
    setCompareSearch("");
  };

  // =========================================================================
  // Overview mode
  // =========================================================================

  if (!focusId) {
    return (
      <div className="p-4 sm:p-6 max-w-3xl">
        <PageHeader
          title="Product Cost Analysis"
          description="Analyse and compare the cost of your products."
        />

        {/* Search + Sort + Filters */}
        {productsWithCost.length > 0 && (
          <div className="mb-6 space-y-3">
            <div className="flex flex-wrap gap-2 items-center">
              <input
                type="search"
                placeholder="Search products…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1 min-w-[12rem] sm:flex-initial sm:w-72 px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="whitespace-nowrap">Sort by</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortMode)}
                  className="px-2 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="cost-asc">Cost/product — low→high</option>
                  <option value="cost-desc">Cost/product — high→low</option>
                  <option value="cost-per-gram-asc">Cost/gram — low→high</option>
                  <option value="cost-per-gram-desc">Cost/gram — high→low</option>
                  <option value="name">Name — A→Z</option>
                </select>
              </label>
              {availableProductCategories.length > 1 && (
                <select
                  value={productCatFilter}
                  onChange={(e) => setProductCatFilter(e.target.value)}
                  className="px-2 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 capitalize"
                >
                  <option value="">All kinds</option>
                  {availableProductCategories.map((c) => (
                    <option key={c.id} value={c.id} className="capitalize">
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
                >
                  Clear
                </button>
              )}
            </div>
            {/* Filling category chips */}
            <div className="flex flex-wrap gap-1.5 items-center">
              <span className="text-xs text-muted-foreground mr-1">Filling:</span>
              {CATEGORY_ORDER.filter((c) => c !== SHELL_CATEGORY).map((cat) => {
                const active = fillingCatFilter.has(cat);
                const hex = resolveCategoryHex(cat, fillingCategoryMap);
                return (
                  <button
                    key={cat}
                    onClick={() => toggleFillingCat(cat)}
                    className={`flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-full border font-medium transition-colors ${
                      active
                        ? "ring-1 ring-current/30"
                        : "text-muted-foreground bg-background border-border hover:bg-muted/60"
                    }`}
                    style={active ? categoryChipStyle(hex) : undefined}
                    aria-pressed={active}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: hex }}
                      aria-hidden="true"
                    />
                    {shortCat(cat)}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {productsWithCost.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center">
            <p className="text-muted-foreground text-sm mb-1">No cost data yet</p>
            <p className="text-xs text-muted-foreground/70">
              Open a product and trigger a cost calculation from the Cost tab to get started.
            </p>
          </div>
        ) : (
          <div className="space-y-px rounded-lg border border-border overflow-hidden">
            {/* Header row */}
            <div className="grid grid-cols-[2rem_1fr_auto_auto] gap-3 items-center px-4 py-2 bg-muted/50 text-xs font-medium text-muted-foreground uppercase tracking-wide">
              <span>#</span>
              <span>Product</span>
              <span className="text-right">Cost/product</span>
              <span className="text-right hidden sm:block">Cost/gram</span>
            </div>

            {filteredProducts.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                No products match your search.
              </div>
            ) : (
              filteredProducts.map((product, idx) => {
                const snap = latestSnapshotByProduct.get(product.id!)!;
                const mould = product.defaultMouldId
                  ? mouldsMap.get(product.defaultMouldId)
                  : undefined;
                const costPerGram = mould
                  ? snap.costPerProduct / mould.cavityWeightG
                  : null;
                const productFillings = fillingsByProduct.get(product.id!) ?? [];
                const cats = [
                  ...new Set(getProductFillingCategories(productFillings, fillingsMap)),
                ];
                const rank = productsWithCost.findIndex((r) => r.id === product.id) + 1;
                const breakdown = getCategoryBreakdown(snap, fillingsMap);

                return (
                  <button
                    key={product.id}
                    onClick={() => setFocusId(product.id!)}
                    className="grid grid-cols-[2rem_1fr_auto_auto] gap-3 items-center w-full px-4 py-3 text-left hover:bg-muted/40 transition-colors border-t border-border first:border-t-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/30"
                  >
                    {/* Rank */}
                    <span className="text-xs font-mono text-muted-foreground tabular-nums">
                      {rank}
                    </span>

                    {/* Name + chips */}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium truncate">{product.name}</span>
                        {product.productCategoryId && productCategoryMap.get(product.productCategoryId) && (
                          <span className="text-xs text-muted-foreground/70 shrink-0 capitalize">
                            {productCategoryMap.get(product.productCategoryId)!.name}
                          </span>
                        )}
                      </div>
                      {/* Category chips */}
                      <div className="flex flex-wrap gap-1 mb-1.5">
                        {cats.map((cat) => {
                          const hex = resolveCategoryHex(cat, fillingCategoryMap);
                          return (
                            <span
                              key={cat}
                              className="text-[10px] px-1.5 py-0.5 rounded border font-medium"
                              style={categoryChipStyle(hex)}
                            >
                              {shortCat(cat)}
                            </span>
                          );
                        })}
                      </div>
                      {/* Mini bar */}
                      <CategoryBar breakdown={breakdown} total={snap.costPerProduct} shellColor={getShellColor(product.coating)} categoryMap={fillingCategoryMap} sym={sym} />
                    </div>

                    {/* Cost/product */}
                    <span className="text-sm font-mono tabular-nums shrink-0">
                      {fmt(snap.costPerProduct, sym)}
                    </span>

                    {/* Cost/gram */}
                    <span className="text-xs font-mono tabular-nums text-muted-foreground shrink-0 hidden sm:block">
                      {costPerGram !== null ? fmtG(costPerGram, sym) : "—"}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        )}

        {/* Legend */}
        {productsWithCost.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-3 items-center">
            {CATEGORY_ORDER.map((cat) => (
              <span key={cat} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {cat === SHELL_CATEGORY ? (
                  <span
                    className="w-2.5 h-2.5 rounded-sm"
                    style={{ background: "linear-gradient(90deg, #3d1a0a 0%, #d4aa6a 100%)" }}
                    title="Colour varies by coating type"
                  />
                ) : (
                  <span
                    className="w-2.5 h-2.5 rounded-sm"
                    style={{ backgroundColor: resolveCategoryHex(cat, fillingCategoryMap) }}
                  />
                )}
                {shortCat(cat)}
              </span>
            ))}
            <Link
              href="/fillings?tab=categories"
              className="text-xs text-muted-foreground/70 hover:text-foreground underline underline-offset-2 ml-2"
              title="Edit category colours"
            >
              Customise colours
            </Link>
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // Analysis mode
  // =========================================================================

  if (!focusProduct || !focusSnapshot) {
    return (
      <div className="p-6">
        <button onClick={clearFocus} className="text-sm text-muted-foreground hover:text-foreground mb-4 flex items-center gap-1">
          <ChevronLeftIcon className="w-4 h-4" /> Back
        </button>
        <p className="text-muted-foreground text-sm">Product not found or no cost data.</p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-4xl">
      {/* Back */}
      <button
        onClick={clearFocus}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-5 transition-colors"
      >
        <ChevronLeftIcon className="w-4 h-4" />
        All products
      </button>

      {/* ---- Focus card ---- */}
      <div className="rounded-xl border border-border bg-card p-5 mb-6">
        {/* Name + type */}
        <div className="flex items-start gap-3 mb-4">
          <div className="flex-1 min-w-0">
            <h2 className="font-[family-name:var(--font-display)] text-xl sm:text-2xl truncate">
              {focusProduct.name}
            </h2>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {focusProduct.productCategoryId && productCategoryMap.get(focusProduct.productCategoryId) && (
                <span className="text-xs text-muted-foreground border border-border rounded px-1.5 py-0.5 capitalize">
                  {productCategoryMap.get(focusProduct.productCategoryId)!.name}
                </span>
              )}
              {focusProduct.coating && (
                <span className="text-xs text-muted-foreground">
                  {focusProduct.coating}
                </span>
              )}
              {focusMould && (
                <span className="text-xs text-muted-foreground">
                  {focusMould.name} ({focusMould.cavityWeightG}g)
                </span>
              )}
            </div>
          </div>
          {/* Rank badge */}
          {rankingContext && (
            <div className="shrink-0 text-right">
              <div className="text-xs text-muted-foreground">rank</div>
              <div className="font-mono font-semibold text-lg leading-tight">
                #{rankingContext.rank}
                <span className="text-xs text-muted-foreground font-normal ml-0.5">
                  /{rankingContext.total}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Cost figures */}
        <div className="flex items-end gap-6 mb-4">
          <div>
            <div className="text-xs text-muted-foreground mb-0.5">Cost / product</div>
            <div className="font-mono text-2xl font-semibold tabular-nums text-foreground">
              {fmt(focusSnapshot.costPerProduct, sym)}
            </div>
          </div>
          {focusCostPerGram !== null && (
            <div>
              <div className="text-xs text-muted-foreground mb-0.5">Cost / gram</div>
              <div className="font-mono text-lg tabular-nums text-muted-foreground">
                {fmtG(focusCostPerGram, sym)}
              </div>
            </div>
          )}
          {(() => {
            const shellEntry = focusCategoryBreakdown.find((e) => e.category === "Shell & Cap");
            const shellPct = shellEntry
              ? Math.round((shellEntry.subtotal / focusSnapshot.costPerProduct) * 100)
              : null;
            if (shellPct === null) return null;
            return (
              <div>
                <div className="text-xs text-muted-foreground mb-0.5">Shell / Filling</div>
                <div className="font-mono text-lg tabular-nums text-muted-foreground">
                  {shellPct}%&thinsp;/&thinsp;{100 - shellPct}%
                </div>
              </div>
            );
          })()}
        </div>

        {/* Category bar */}
        <div className="mb-2">
          <CategoryBar breakdown={focusCategoryBreakdown} total={focusSnapshot.costPerProduct} shellColor={getShellColor(focusProduct.coating)} categoryMap={fillingCategoryMap} sym={sym} />
        </div>
        {/* Bar legend with values */}
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {focusCategoryBreakdown.map(({ category, subtotal }) => {
            const hex = resolveCategoryHex(category, fillingCategoryMap, getShellColor(focusProduct.coating));
            return (
              <span key={category} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span
                  className="w-2 h-2 rounded-sm"
                  style={{ backgroundColor: hex }}
                />
                {shortCat(category)}
                <span className="font-mono tabular-nums">{fmt(subtotal, sym)}</span>
                <span className="text-muted-foreground/50">
                  ({Math.round((subtotal / focusSnapshot.costPerProduct) * 100)}%)
                </span>
              </span>
            );
          })}
        </div>

        {/* Category chips */}
        {focusCategories.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-border">
            {[...new Set(focusCategories)].map((cat) => {
              const hex = resolveCategoryHex(cat, fillingCategoryMap);
              return (
                <span
                  key={cat}
                  className="text-xs px-2 py-0.5 rounded-full border font-medium"
                  style={categoryChipStyle(hex)}
                >
                  {shortCat(cat)}
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* ---- Similar products ---- */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Similar products
        </h3>

        {similarRanked.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No similar products with cost data found.
          </p>
        ) : (
          <div className="space-y-2">
            {similarRanked.map(({ productId, score, sharedCategories }) => {
              const product = productsMap.get(productId);
              const snap = latestSnapshotByProduct.get(productId);
              if (!product || !snap) return null;
              const isPinned = compareIds.includes(productId);

              return (
                <div
                  key={productId}
                  className="flex items-center gap-3 rounded-lg border border-border bg-card p-3"
                >
                  {/* Similarity score */}
                  <div className="shrink-0 w-10 text-center">
                    <div className="text-xs font-mono font-semibold text-primary">
                      {Math.round(score * 100)}%
                    </div>
                    <div className="text-[9px] text-muted-foreground/60 uppercase tracking-wide">match</div>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{product.name}</span>
                      {product.productCategoryId && productCategoryMap.get(product.productCategoryId) && (
                        <span className="text-xs text-muted-foreground/60 shrink-0 capitalize">{productCategoryMap.get(product.productCategoryId)!.name}</span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {sharedCategories.map((cat) => {
                        const hex = resolveCategoryHex(cat, fillingCategoryMap);
                        return (
                          <span
                            key={cat}
                            className="text-[10px] px-1.5 py-0.5 rounded border font-medium"
                            style={categoryChipStyle(hex)}
                          >
                            {shortCat(cat)}
                          </span>
                        );
                      })}
                    </div>
                  </div>

                  {/* Cost */}
                  <div className="text-right shrink-0">
                    <div className="text-sm font-mono tabular-nums">{fmt(snap.costPerProduct, sym)}</div>
                    {(() => {
                      const delta = snap.costPerProduct - focusSnapshot.costPerProduct;
                      return (
                        <div
                          className={`text-xs font-mono tabular-nums ${
                            Math.abs(delta) < 0.001
                              ? "text-muted-foreground"
                              : delta > 0
                              ? "text-rose-600"
                              : "text-emerald-600"
                          }`}
                        >
                          {delta >= 0 ? "+" : ""}{fmt(delta, sym)}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Pin button */}
                  <button
                    onClick={() =>
                      isPinned ? removeFromCompare(productId) : addToCompare(productId)
                    }
                    disabled={!isPinned && compareIds.length >= 3}
                    className={`shrink-0 text-xs px-2.5 py-1.5 rounded border transition-colors font-medium ${
                      isPinned
                        ? "border-primary text-primary bg-primary/5 hover:bg-primary/10"
                        : compareIds.length >= 3
                        ? "border-border text-muted-foreground/40 cursor-not-allowed"
                        : "border-border text-muted-foreground hover:text-foreground hover:border-primary/40"
                    }`}
                  >
                    {isPinned ? "Comparing" : "Compare"}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Add any product */}
        <div className="mt-3">
          {addingCompare ? (
            <div className="relative">
              <input
                ref={compareInputRef}
                type="text"
                placeholder="Search any product to compare…"
                value={compareSearch}
                onChange={(e) => setCompareSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setAddingCompare(false);
                    setCompareSearch("");
                  }
                }}
                className="w-full px-3 py-2 text-sm border border-primary/40 rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              {compareSearchResults.length > 0 && (
                <div className="absolute z-10 top-full left-0 right-0 mt-1 rounded-lg border border-border bg-card shadow-lg overflow-hidden">
                  {compareSearchResults.map((r) => {
                    const snap = latestSnapshotByProduct.get(r.id!);
                    return (
                      <button
                        key={r.id}
                        onClick={() => addToCompare(r.id!)}
                        className="flex items-center justify-between w-full px-3 py-2.5 text-left hover:bg-muted/50 transition-colors border-b border-border last:border-b-0"
                      >
                        <span className="text-sm">{r.name}</span>
                        {snap && (
                          <span className="text-xs font-mono text-muted-foreground tabular-nums">
                            {fmt(snap.costPerProduct, sym)}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={() => setAddingCompare(true)}
              disabled={compareIds.length >= 3}
              className={`text-sm px-3 py-1.5 rounded-full border transition-colors ${
                compareIds.length >= 3
                  ? "border-border text-muted-foreground/40 cursor-not-allowed"
                  : "border-border text-muted-foreground hover:text-foreground hover:border-primary/40"
              }`}
            >
              + Add any product to compare
            </button>
          )}
        </div>
      </div>

      {/* ---- Comparison table ---- */}
      {compareIds.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Comparison
          </h3>

          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide w-36 sm:w-44">
                    Metric
                  </th>
                  {allCompareIds.map((id) => {
                    const product = productsMap.get(id);
                    const isFocus = id === focusId;
                    return (
                      <th key={id} className="px-4 py-3 text-right">
                        <div className="flex flex-col items-end gap-1">
                          <span
                            className={`text-xs font-semibold truncate max-w-[8rem] ${
                              isFocus ? "text-primary" : "text-foreground"
                            }`}
                          >
                            {product?.name ?? "—"}
                          </span>
                          {isFocus && (
                            <span className="text-[9px] text-primary/60 uppercase tracking-wide font-medium">
                              Focus
                            </span>
                          )}
                          {!isFocus && (
                            <button
                              onClick={() => removeFromCompare(id)}
                              className="text-[9px] text-muted-foreground/50 hover:text-muted-foreground transition-colors uppercase tracking-wide"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {/* Cost / product */}
                <CompareRow
                  label="Cost / product"
                  values={allCompareIds.map((id) => {
                    const snap = latestSnapshotByProduct.get(id);
                    return snap ? fmt(snap.costPerProduct, sym) : "—";
                  })}
                  highlightMin
                  numericValues={allCompareIds.map((id) => latestSnapshotByProduct.get(id)?.costPerProduct ?? null)}
                />

                {/* Cost / gram */}
                <CompareRow
                  label="Cost / gram"
                  values={allCompareIds.map((id) => {
                    const product = productsMap.get(id);
                    const snap = latestSnapshotByProduct.get(id);
                    const mould = product?.defaultMouldId ? mouldsMap.get(product.defaultMouldId) : undefined;
                    if (!snap || !mould) return "—";
                    return fmtG(snap.costPerProduct / mould.cavityWeightG, sym);
                  })}
                  highlightMin
                  numericValues={allCompareIds.map((id) => {
                    const product = productsMap.get(id);
                    const snap = latestSnapshotByProduct.get(id);
                    const mould = product?.defaultMouldId ? mouldsMap.get(product.defaultMouldId) : undefined;
                    if (!snap || !mould) return null;
                    return snap.costPerProduct / mould.cavityWeightG;
                  })}
                />

                {/* Cost structure bars */}
                <tr className="border-t border-border">
                  <td className="px-4 py-2.5 text-xs text-muted-foreground font-medium">Structure</td>
                  {allCompareIds.map((id) => {
                    const snap = latestSnapshotByProduct.get(id);
                    const product = productsMap.get(id);
                    const bd = snap ? getCategoryBreakdown(snap, fillingsMap) : [];
                    return (
                      <td key={id} className="px-4 py-2.5">
                        <CategoryBar
                          breakdown={bd}
                          total={snap?.costPerProduct ?? 0}
                          shellColor={getShellColor(product?.coating)}
                          categoryMap={fillingCategoryMap}
                          sym={sym}
                        />
                      </td>
                    );
                  })}
                </tr>

                {/* Per-category rows */}
                {allCompareCategories.map((cat) => (
                  <CompareRow
                    key={cat}
                    label={
                      <span className="flex items-center gap-1.5">
                        <span
                          className="w-2 h-2 rounded-sm shrink-0"
                          style={{ backgroundColor: resolveCategoryHex(cat, fillingCategoryMap) }}
                        />
                        {shortCat(cat)}
                      </span>
                    }
                    values={compareCategoryBreakdowns.map((bd) => {
                      const entry = bd.find((e) => e.category === cat);
                      return entry ? fmt(entry.subtotal, sym) : "—";
                    })}
                    highlightMin
                    numericValues={compareCategoryBreakdowns.map((bd) => {
                      const entry = bd.find((e) => e.category === cat);
                      return entry?.subtotal ?? null;
                    })}
                  />
                ))}

                {/* Shared ingredients section */}
                {sharedIngredients.length > 0 && (
                  <>
                    <tr>
                      <td
                        colSpan={allCompareIds.length + 1}
                        className="px-4 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide bg-muted/30 border-t border-border"
                      >
                        Shared ingredients
                      </td>
                    </tr>
                    {sharedIngredients.map(({ ingredientId, name, subtotals }) => (
                      <CompareRow
                        key={ingredientId}
                        label={<span className="text-muted-foreground">{name}</span>}
                        values={subtotals.map((v) => (v !== null ? fmt(v, sym) : "—"))}
                        highlightMin
                        numericValues={subtotals}
                        dimEmpty
                      />
                    ))}
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Comparison row component
// ---------------------------------------------------------------------------

interface CompareRowProps {
  label: React.ReactNode;
  values: string[];
  numericValues: (number | null)[];
  highlightMin?: boolean;
  dimEmpty?: boolean;
}

function CompareRow({ label, values, numericValues, highlightMin, dimEmpty }: CompareRowProps) {
  const validNums = numericValues.filter((v): v is number => v !== null);
  const minVal = validNums.length > 0 ? Math.min(...validNums) : null;

  return (
    <tr className="border-t border-border hover:bg-muted/20 transition-colors">
      <td className="px-4 py-2.5 text-xs text-muted-foreground font-medium">{label}</td>
      {values.map((val, i) => {
        const num = numericValues[i];
        const isMin = highlightMin && minVal !== null && num === minVal && validNums.length > 1;
        const isEmpty = val === "—";
        return (
          <td
            key={i}
            className={`px-4 py-2.5 text-right font-mono text-xs tabular-nums ${
              isEmpty && dimEmpty
                ? "text-muted-foreground/30"
                : isEmpty
                ? "text-muted-foreground/50"
                : isMin
                ? "text-emerald-700 font-semibold"
                : "text-foreground"
            }`}
          >
            {val}
            {isMin && !isEmpty && (
              <span className="ml-1 text-[9px] text-emerald-600/60">↓</span>
            )}
          </td>
        );
      })}
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Icon
// ---------------------------------------------------------------------------

function ChevronLeftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
    </svg>
  );
}
