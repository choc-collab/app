"use client";

import { useState, useMemo, useCallback, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { useProductsList, saveProduct, useProductCategories, useProductCategoryUsageCounts, saveProductCategory, useCoatings, useProductProductionMap, useCollections, useAllCollectionProducts, useProductFillingsForProducts, useFillings, useMarketRegion } from "@/lib/hooks";
import { Plus, Search, ChevronRight, ChevronDown, SlidersHorizontal, X } from "lucide-react";
import { ListToolbar, FilterPanel, ArchiveFilterChip, QuickAddForm, EmptyState, ListItemCard } from "@/components/pantry";
import { useNShortcut } from "@/lib/use-n-shortcut";
import { formatCategoryRange } from "@/lib/productCategories";
import Link from "next/link";
import type { Product } from "@/types";
import { getAllergensByRegion, allergenLabel } from "@/types";
import { usePersistedFilters } from "@/lib/use-persisted-filters";
import { shelfLifeBucket, SHELF_LIFE_BUCKET_LABELS, SHELF_LIFE_BUCKET_ORDER, type ShelfLifeBucket } from "@/lib/shelfLifeBuckets";
type ProductSummary = Omit<Product, "photo">;

type ProductsMainTab = "products" | "categories";
const TABS: { id: ProductsMainTab; label: string }[] = [
  { id: "products", label: "Products" },
  { id: "categories", label: "Categories" },
];

export default function ProductsPage() {
  return (
    <Suspense fallback={null}>
      <ProductsPageInner />
    </Suspense>
  );
}

function ProductsPageInner() {
  const [tab, setTab] = usePersistedFilters("products-tab", { activeTab: "products" as ProductsMainTab });
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");

  // URL param wins over sessionStorage (so "Back" links from a category detail land on the right tab)
  useEffect(() => {
    if (tabParam === "products" || tabParam === "categories") {
      if (tab.activeTab !== tabParam) setTab("activeTab", tabParam);
    }
  }, [tabParam]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeTab = tab.activeTab;

  return (
    <div>
      <PageHeader title="Products" description="Your product collection and the categories that group them" />

      <div className="px-4 mb-3">
        <div className="flex gap-1 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setTab("activeTab", id)}
              className={`px-3.5 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                activeTab === id
                  ? "bg-accent text-accent-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "products" && <ProductsTab />}
      {activeTab === "categories" && <ProductCategoriesTab />}
    </div>
  );
}

function ProductsTab() {
  const router = useRouter();
  const [f, setF] = usePersistedFilters("products", {
    search: "",
    showFilters: false,
    showArchived: false,
    filterTags: [] as string[],
    filterCoating: "",
    filterCategoryId: "",
    filterMinStars: 0,
    filterCollectionId: "",
    filterActiveCollections: false,
    filterIncludeAllergens: [] as string[],
    filterExcludeAllergens: [] as string[],
    filterFillingCount: "",
    filterShelfLife: [] as ShelfLifeBucket[],
  });
  const products = useProductsList(f.showArchived);
  const productionMap = useProductProductionMap();
  const productCategories = useProductCategories(true /* include archived for grouping legacy products */);
  const coatings = useCoatings();
  const collections = useCollections();
  const allCollectionProducts = useAllCollectionProducts();
  const allFillings = useFillings();
  const allProductIds = useMemo(() => products.map((r) => r.id!).filter(Boolean), [products]);
  const productFillingsMap = useProductFillingsForProducts(allProductIds);
  const fillingNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const l of allFillings) map.set(l.id!, l.name);
    return map;
  }, [allFillings]);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [collapsedTypes, setCollapsedTypes] = useState<Set<string>>(new Set());
  const marketRegion = useMarketRegion();

  const filterTagsSet = useMemo(() => new Set(f.filterTags), [f.filterTags]);
  const filterIncludeAllergensSet = useMemo(() => new Set(f.filterIncludeAllergens), [f.filterIncludeAllergens]);
  const filterExcludeAllergensSet = useMemo(() => new Set(f.filterExcludeAllergens), [f.filterExcludeAllergens]);

  const toggleFilterTag = useCallback((tag: string) => {
    const next = new Set(filterTagsSet);
    if (next.has(tag)) next.delete(tag); else next.add(tag);
    setF("filterTags", Array.from(next));
  }, [filterTagsSet, setF]);

  const toggleIncludeAllergen = useCallback((a: string) => {
    const next = new Set(filterIncludeAllergensSet);
    if (next.has(a)) next.delete(a); else next.add(a);
    setF("filterIncludeAllergens", Array.from(next));
  }, [filterIncludeAllergensSet, setF]);

  const toggleExcludeAllergen = useCallback((a: string) => {
    const next = new Set(filterExcludeAllergensSet);
    if (next.has(a)) next.delete(a); else next.add(a);
    setF("filterExcludeAllergens", Array.from(next));
  }, [filterExcludeAllergensSet, setF]);

  // Collect all tags across all products for the filter UI
  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const r of products) for (const t of (r.tags ?? [])) set.add(t);
    return Array.from(set).sort();
  }, [products]);

  // Build a fillingId → allergens map for quick lookup
  const fillingAllergenMap = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const l of allFillings) map.set(l.id!, l.allergens ?? []);
    return map;
  }, [allFillings]);

  // Build productId → Set<allergenId> by unioning allergens from all fillings in the product
  const productAllergenMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const [productId, rl] of productFillingsMap) {
      const allergens = new Set<string>();
      for (const { fillingId } of rl) {
        for (const a of (fillingAllergenMap.get(fillingId) ?? [])) allergens.add(a);
      }
      map.set(productId, allergens);
    }
    return map;
  }, [productFillingsMap, fillingAllergenMap]);

  // Precompute productId → fillingName[] so each row render is an O(1) lookup.
  const productFillingNamesMap = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const [productId, rl] of productFillingsMap) {
      const names: string[] = [];
      for (const { fillingId } of rl) {
        const n = fillingNameMap.get(fillingId);
        if (n) names.push(n);
      }
      map.set(productId, names);
    }
    return map;
  }, [productFillingsMap, fillingNameMap]);

  // Allergens that actually appear across all products (ordered by region list)
  const presentAllergens = useMemo(() => {
    const present = new Set<string>();
    for (const allergens of productAllergenMap.values()) for (const a of allergens) present.add(a);
    const regionList = getAllergensByRegion(marketRegion);
    // Return region-ordered first, then any extras not in the region list
    const ordered = regionList.filter(a => present.has(a.id));
    const regionIds = new Set(regionList.map(a => a.id));
    for (const id of present) if (!regionIds.has(id)) ordered.push({ id, label: allergenLabel(id) });
    return ordered;
  }, [productAllergenMap, marketRegion]);

  // Determine which collections are currently active (startDate <= today, endDate unset or >= today)
  const today = new Date().toISOString().slice(0, 10);
  const activeCollectionIds = useMemo(() => {
    return new Set(
      collections
        .filter((c) => c.startDate <= today && (!c.endDate || c.endDate >= today))
        .map((c) => c.id!)
    );
  }, [collections, today]);

  // Build a set of product IDs for the active collection filter
  const activeCollectionProductIds = useMemo(() => {
    return new Set(
      allCollectionProducts
        .filter((cr) => activeCollectionIds.has(cr.collectionId))
        .map((cr) => cr.productId)
    );
  }, [allCollectionProducts, activeCollectionIds]);

  // Build a set of product IDs for the specific collection filter
  const selectedCollectionProductIds = useMemo(() => {
    if (!f.filterCollectionId) return null;
    return new Set(
      allCollectionProducts
        .filter((cr) => cr.collectionId === f.filterCollectionId)
        .map((cr) => cr.productId)
    );
  }, [allCollectionProducts, f.filterCollectionId]);

  const activeFilterCount =
    (filterTagsSet.size > 0 ? 1 : 0) +
    (f.filterCoating ? 1 : 0) +
    (f.filterCategoryId ? 1 : 0) +
    (f.filterMinStars > 0 ? 1 : 0) +
    (f.showArchived ? 1 : 0) +
    (f.filterCollectionId ? 1 : 0) +
    (f.filterActiveCollections ? 1 : 0) +
    (filterIncludeAllergensSet.size > 0 ? 1 : 0) +
    (filterExcludeAllergensSet.size > 0 ? 1 : 0) +
    (f.filterFillingCount ? 1 : 0) +
    (f.filterShelfLife.length > 0 ? 1 : 0);

  const filterShelfLifeSet = useMemo(() => new Set(f.filterShelfLife), [f.filterShelfLife]);
  const toggleShelfLifeBucket = useCallback((bucket: ShelfLifeBucket) => {
    const next = new Set(filterShelfLifeSet);
    if (next.has(bucket)) next.delete(bucket); else next.add(bucket);
    setF("filterShelfLife", Array.from(next));
  }, [filterShelfLifeSet, setF]);

  const filtered = useMemo(() => {
    return products.filter((r) => {
      if (f.search && !r.name.toLowerCase().includes(f.search.toLowerCase())) return false;
      if (f.filterCoating && r.coating !== f.filterCoating) return false;
      if (f.filterCategoryId && r.productCategoryId !== f.filterCategoryId) return false;
      if (f.filterMinStars > 0 && (r.popularity ?? 0) < f.filterMinStars) return false;
      if (filterTagsSet.size > 0) {
        const rTags = new Set(r.tags ?? []);
        for (const t of filterTagsSet) if (!rTags.has(t)) return false;
      }
      if (f.filterActiveCollections && !activeCollectionProductIds.has(r.id!)) return false;
      if (selectedCollectionProductIds && !selectedCollectionProductIds.has(r.id!)) return false;
      if (filterIncludeAllergensSet.size > 0) {
        const rAllergens = productAllergenMap.get(r.id!) ?? new Set();
        let hasAny = false;
        for (const a of filterIncludeAllergensSet) if (rAllergens.has(a)) { hasAny = true; break; }
        if (!hasAny) return false;
      }
      if (filterExcludeAllergensSet.size > 0) {
        const rAllergens = productAllergenMap.get(r.id!) ?? new Set();
        for (const a of filterExcludeAllergensSet) if (rAllergens.has(a)) return false;
      }
      if (f.filterFillingCount) {
        const count = (productFillingsMap.get(r.id!) ?? []).length;
        if (f.filterFillingCount === "4+") { if (count < 4) return false; }
        else if (count !== parseInt(f.filterFillingCount)) return false;
      }
      if (filterShelfLifeSet.size > 0) {
        const bucket = shelfLifeBucket(r.shelfLifeWeeks);
        if (!filterShelfLifeSet.has(bucket)) return false;
      }
      return true;
    });
  }, [products, f.search, f.filterCoating, f.filterCategoryId, f.filterMinStars, filterTagsSet, f.filterActiveCollections, activeCollectionProductIds, selectedCollectionProductIds, filterExcludeAllergensSet, productAllergenMap, f.filterFillingCount, productFillingsMap, filterShelfLifeSet]);

  // Group by productCategoryId; uncategorised goes last — single O(N) pass
  const grouped = useMemo(() => {
    const categoryById = new Map(productCategories.map((c) => [c.id!, c]));
    const groupMap = new Map<string, typeof filtered>();
    const other: typeof filtered = [];
    for (const r of filtered) {
      const cid = r.productCategoryId;
      if (!cid || !categoryById.has(cid)) {
        other.push(r);
      } else {
        if (!groupMap.has(cid)) groupMap.set(cid, []);
        groupMap.get(cid)!.push(r);
      }
    }
    const groups: { type: string; label: string; products: typeof filtered }[] = [];
    // Iterate categories in their stable (alphabetical) order from the hook
    for (const c of productCategories) {
      const inGroup = groupMap.get(c.id!);
      if (inGroup?.length) {
        groups.push({
          type: c.id!,
          label: c.name.charAt(0).toUpperCase() + c.name.slice(1),
          products: inGroup,
        });
      }
    }
    if (other.length > 0) {
      groups.push({ type: "", label: "Uncategorised", products: other });
    }
    return groups;
  }, [filtered, productCategories]);

  function toggleType(type: string) {
    setCollapsedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type); else next.add(type);
      return next;
    });
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    const id = await saveProduct({ name: newName.trim() });
    router.push(`/products/${encodeURIComponent(String(id))}?new=1`);
  }

  return (
    <div>
      <div className="px-4 space-y-3 pb-6">
        <div className="flex gap-2">
          <div className="flex-1 relative min-w-0">
            <Search aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={f.search}
              onChange={(e) => setF("search", e.target.value)}
              placeholder="Search products…"
              aria-label="Search products"
              className="input !pl-9"
            />
          </div>
          <button
            onClick={() => setF("showFilters", !f.showFilters)}
            className={`relative rounded-full border p-2 transition-colors ${f.showFilters ? "bg-accent text-accent-foreground border-accent" : "border-border bg-background"}`}
            aria-label="Filters"
          >
            <SlidersHorizontal className="w-5 h-5" />
            {activeFilterCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setShowAdd(true)}
            className="rounded-full bg-accent text-accent-foreground p-2"
            aria-label="Add new product"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>

        {f.showFilters && (
          <div className="rounded-lg border border-border bg-card p-3 space-y-3">
            {/* Min stars */}
            <div>
              <p className="text-xs text-muted-foreground mb-1">Min. popularity</p>
              <div className="flex gap-1">
                {[0, 1, 2, 3, 4, 5].map((s) => (
                  <button
                    key={s}
                    onClick={() => setF("filterMinStars", s === f.filterMinStars ? 0 : s)}
                    className={`rounded-full px-2 py-1 text-xs font-medium transition-colors ${f.filterMinStars === s && s > 0 ? "bg-accent text-accent-foreground" : "border border-border"}`}
                  >
                    {s === 0 ? "Any" : `${s}★+`}
                  </button>
                ))}
              </div>
            </div>
            {/* Category */}
            {productCategories.filter((c) => !c.archived).length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Category</p>
                <div className="flex flex-wrap gap-1">
                  {productCategories.filter((c) => !c.archived).map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setF("filterCategoryId", f.filterCategoryId === c.id ? "" : (c.id ?? ""))}
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize transition-colors ${f.filterCategoryId === c.id ? "bg-accent text-accent-foreground" : "border border-border"}`}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {/* Coating */}
            {coatings.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Coating</p>
                <div className="flex flex-wrap gap-1">
                  {coatings.map((c) => (
                    <button
                      key={c}
                      onClick={() => setF("filterCoating", f.filterCoating === c ? "" : c)}
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize transition-colors ${f.filterCoating === c ? "bg-accent text-accent-foreground" : "border border-border"}`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {/* Filling count */}
            <div>
              <p className="text-xs text-muted-foreground mb-1">No. of fillings</p>
              <div className="flex gap-1">
                {["", "1", "2", "3", "4+"].map((opt) => (
                  <button
                    key={opt}
                    onClick={() => setF("filterFillingCount", f.filterFillingCount === opt ? "" : opt)}
                    className={`rounded-full px-2 py-1 text-xs font-medium transition-colors ${f.filterFillingCount === opt && opt !== "" ? "bg-accent text-accent-foreground" : "border border-border"}`}
                  >
                    {opt === "" ? "Any" : opt}
                  </button>
                ))}
              </div>
            </div>
            {/* Tags */}
            {allTags.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Tags</p>
                <div className="flex flex-wrap gap-1">
                  {allTags.map((tag) => (
                    <button
                      key={tag}
                      onClick={() => toggleFilterTag(tag)}
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize transition-colors ${filterTagsSet.has(tag) ? "bg-accent text-accent-foreground" : "border border-border"}`}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {/* Collection */}
            {collections.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Collection</p>
                <div className="flex flex-col gap-1.5">
                  <select
                    value={f.filterCollectionId}
                    onChange={(e) => { setF("filterCollectionId", e.target.value); if (e.target.value) setF("filterActiveCollections", false); }}
                    className="input text-sm py-1"
                  >
                    <option value="">All collections</option>
                    {collections.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={f.filterActiveCollections}
                      onChange={(e) => { setF("filterActiveCollections", e.target.checked); if (e.target.checked) setF("filterCollectionId", ""); }}
                      className="rounded border-border"
                    />
                    Active collections only
                    {activeCollectionIds.size > 0 && (
                      <span className="text-muted-foreground">({activeCollectionIds.size} active)</span>
                    )}
                  </label>
                </div>
              </div>
            )}
            {/* Contains allergen */}
            {presentAllergens.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Contains allergen</p>
                <div className="flex flex-wrap gap-1">
                  {presentAllergens.map(({ id, label }) => (
                    <button
                      key={id}
                      onClick={() => toggleIncludeAllergen(id)}
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${filterIncludeAllergensSet.has(id) ? "bg-accent text-accent-foreground" : "border border-border"}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {/* Exclude allergens */}
            {presentAllergens.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Exclude allergens</p>
                <div className="flex flex-wrap gap-1">
                  {presentAllergens.map(({ id, label }) => (
                    <button
                      key={id}
                      onClick={() => toggleExcludeAllergen(id)}
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${filterExcludeAllergensSet.has(id) ? "bg-destructive text-destructive-foreground" : "border border-border"}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {/* Shelf life */}
            <div>
              <p className="text-xs text-muted-foreground mb-1.5">Shelf life</p>
              <div className="flex flex-wrap gap-1">
                {SHELF_LIFE_BUCKET_ORDER.map((bucket) => (
                  <button
                    key={bucket}
                    onClick={() => toggleShelfLifeBucket(bucket)}
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${filterShelfLifeSet.has(bucket) ? "bg-accent text-accent-foreground" : "border border-border text-muted-foreground"}`}
                  >
                    {SHELF_LIFE_BUCKET_LABELS[bucket]}
                  </button>
                ))}
              </div>
            </div>
            {/* Archived */}
            <ArchiveFilterChip
              value={f.showArchived}
              onChange={(v) => setF("showArchived", v)}
            />
            {activeFilterCount > 0 && (
              <button
                onClick={() => { setF("filterTags", []); setF("filterCoating", ""); setF("filterCategoryId", ""); setF("filterMinStars", 0); setF("showArchived", false); setF("filterCollectionId", ""); setF("filterActiveCollections", false); setF("filterIncludeAllergens", []); setF("filterExcludeAllergens", []); setF("filterFillingCount", ""); setF("filterShelfLife", []); }}
                className="text-xs text-muted-foreground flex items-center gap-1"
              >
                <X className="w-3 h-3" /> Clear all filters
              </button>
            )}
          </div>
        )}

        {showAdd && (
          <form onSubmit={handleAdd} className="rounded-lg border border-border bg-card p-3 space-y-2">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Product name…"
              aria-label="Product name"
              required
              autoFocus
              className="input"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={!newName.trim()}
                className="btn-primary flex-1 py-2"
              >
                Create Product
              </button>
              <button
                type="button"
                onClick={() => { setShowAdd(false); setNewName(""); }}
                className="btn-secondary px-4 py-2"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {filtered.length === 0 ? (
          <p className="text-muted-foreground text-sm py-8 text-center">
            {products.length === 0
              ? "No products yet. Tap + to add your first."
              : "No products match your search."}
          </p>
        ) : (
          <div className="space-y-4">
            <div className="flex justify-end gap-3">
              <button onClick={() => setCollapsedTypes(new Set(grouped.map((g) => g.type)))} className="text-xs text-muted-foreground">Collapse all</button>
              <button onClick={() => setCollapsedTypes(new Set())} className="text-xs text-muted-foreground">Expand all</button>
            </div>
            {grouped.map(({ type, label, products: groupProducts }) => {
              const isCollapsed = collapsedTypes.has(type);
              return (
                <div key={type}>
                  <button
                    onClick={() => toggleType(type)}
                    aria-expanded={!isCollapsed}
                    className="flex items-center gap-2 w-full text-left mb-2"
                  >
                    <ChevronDown aria-hidden="true" className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${isCollapsed ? "-rotate-90" : ""}`} />
                    <h2 className="text-sm font-semibold text-primary">{label}</h2>
                    <span className="text-xs text-muted-foreground">({groupProducts.length})</span>
                  </button>
                  {!isCollapsed && (
                    <ul className="space-y-2 ml-6">
                      {groupProducts.map((product) => {
                        const pid = product.id ?? '';
                        const fillingNames = productFillingNamesMap.get(pid) ?? [];
                        const allergens = Array.from(productAllergenMap.get(pid) ?? []);
                        return <ProductRow key={product.id} product={product} productionInfo={productionMap.get(pid)} fillingNames={fillingNames} allergens={allergens} />;
                      })}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function formatRelativeDate(date: Date): string {
  const d = new Date(date);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 30) return `${diffDays}d ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
  return `${Math.floor(diffDays / 365)}y ago`;
}

function ProductRow({ product, productionInfo, fillingNames, allergens }: { product: ProductSummary; productionInfo?: { lastProducedAt: Date; inStock: boolean }; fillingNames?: string[]; allergens?: string[] }) {
  // Row 2: "Milk · filling1 · filling2" — coating capitalised, prefixed if present
  const subtitleParts = [
    product.coating ? product.coating.charAt(0).toUpperCase() + product.coating.slice(1) : null,
    ...(fillingNames ?? []),
  ].filter((p): p is string => Boolean(p));

  const hasTags = (product.tags ?? []).length > 0;
  const hasAllergens = (allergens ?? []).length > 0;

  return (
    <li
      className={`rounded-lg border bg-card ${product.archived ? "border-border/50 opacity-60" : "border-border"}`}
      style={{ contentVisibility: "auto", containIntrinsicSize: "0 64px" }}
    >
      <Link href={`/products/${encodeURIComponent(product.id ?? '')}`} className="flex items-center gap-2.5 px-3 py-2.5 min-w-0">
        <div className="w-8 h-8 rounded-md bg-muted shrink-0 flex items-center justify-center text-muted-foreground text-sm font-medium">
          {product.name.charAt(0)}
        </div>
        <div className="min-w-0 flex-1">
          {/* Row 1: name + stars */}
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-sm truncate min-w-0">
              {product.name}
              {product.archived && (
                <span className="ml-1.5 text-[10px] font-normal text-muted-foreground align-middle">archived</span>
              )}
            </h3>
            {product.popularity && (
              <div className="flex gap-0.5 shrink-0 ml-auto">
                {[1, 2, 3, 4, 5].map((star) => (
                  <svg key={star} className={`w-2.5 h-2.5 ${product.popularity! >= star ? "text-primary fill-primary" : "text-border fill-transparent"}`} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.563.563 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" />
                  </svg>
                ))}
              </div>
            )}
          </div>
          {/* Row 2: coating · fillings */}
          {subtitleParts.length > 0 && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">{subtitleParts.join(" · ")}</p>
          )}
          {/* Row 3: tags + allergens together */}
          {(hasTags || hasAllergens) && (
            <div className="flex flex-wrap gap-1 mt-0.5">
              {(product.tags ?? []).map((tag) => (
                <span key={tag} className="rounded-full bg-muted text-muted-foreground px-2 py-0.5 text-[10px] capitalize">
                  {tag}
                </span>
              ))}
              {(allergens ?? []).map((a) => (
                <span key={a} className="rounded-full border border-amber-300 bg-amber-50 text-amber-800 px-2 py-0.5 text-[10px]">
                  {allergenLabel(a)}
                </span>
              ))}
            </div>
          )}
          {/* Row 4: production info */}
          {productionInfo && (
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[10px] text-muted-foreground">
                {formatRelativeDate(productionInfo.lastProducedAt)}
              </span>
              {productionInfo.inStock ? (
                <span className="text-[10px] font-medium text-success bg-success-muted px-1.5 py-0.5 rounded-full">in stock</span>
              ) : (
                <span className="text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">out of stock</span>
              )}
            </div>
          )}
        </div>
        <ChevronRight aria-hidden="true" className="w-4 h-4 text-muted-foreground shrink-0" />
      </Link>
    </li>
  );
}

// ─── Product Categories Tab ─────────────────────────────────────────────────

function ProductCategoriesTab() {
  const router = useRouter();
  const [f, setF] = usePersistedFilters("product-categories", {
    search: "",
    showFilters: false,
    showArchived: false,
  });

  const categories = useProductCategories(f.showArchived);
  const usageCounts = useProductCategoryUsageCounts();

  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");

  useNShortcut(() => setShowAdd(true), showAdd);

  const activeFilterCount = (f.showArchived ? 1 : 0);

  const filtered = useMemo(() => {
    return categories.filter((c) => {
      if (f.search && !c.name.toLowerCase().includes(f.search.toLowerCase())) return false;
      return true;
    });
  }, [categories, f.search]);

  function clearFilters() {
    setF("showArchived", false);
  }

  async function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!newName.trim()) return;
    const id = await saveProductCategory({
      name: newName.trim(),
      shellPercentMin: 15,
      shellPercentMax: 50,
      defaultShellPercent: 30,
    });
    setNewName("");
    setShowAdd(false);
    // Redirect to the detail page so the user can set the shell-percent range —
    // unlike filling categories, product categories need more than a name + checkbox.
    router.push(`/products/categories/${encodeURIComponent(id)}?new=1`);
  }

  return (
    <div className="px-4 space-y-3 pb-6">
      <ListToolbar
        search={f.search}
        onSearchChange={(v) => setF("search", v)}
        searchPlaceholder="Search categories…"
        searchAriaLabel="Search product categories"
        onAdd={() => setShowAdd(true)}
        addAriaLabel="Add product category"
        addTitle="Add category (n)"
        showFilters
        filterPanelOpen={f.showFilters}
        onToggleFilters={() => setF("showFilters", !f.showFilters)}
        activeFilterCount={activeFilterCount}
      />

      {f.showFilters && (
        <FilterPanel activeFilterCount={activeFilterCount} onClearAll={clearFilters}>
          <ArchiveFilterChip
            value={f.showArchived}
            onChange={(v) => setF("showArchived", v)}
          />
        </FilterPanel>
      )}

      {showAdd && (
        <QuickAddForm
          onSubmit={handleAdd}
          onCancel={() => { setShowAdd(false); setNewName(""); }}
          submitLabel="Create Category"
          canSubmit={!!newName.trim()}
        >
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") { setShowAdd(false); setNewName(""); } }}
            placeholder="Category name (e.g. truffle)…"
            aria-label="Category name"
            className="input w-full"
            autoFocus
            required
          />
        </QuickAddForm>
      )}

      {filtered.length === 0 && (
        <EmptyState
          hasData={categories.length > 0}
          emptyMessage="No product categories yet. Tap + to add your first."
          filteredMessage="No categories match your search."
        />
      )}

      {filtered.length > 0 && (
        <ul className="space-y-2">
          {filtered.map((c) => {
            const usage = usageCounts.get(c.id!) ?? 0;
            return (
              <ListItemCard
                key={c.id}
                href={`/products/categories/${encodeURIComponent(c.id!)}`}
                archived={c.archived}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm capitalize truncate">{c.name}</span>
                    {c.archived && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">Archived</span>
                    )}
                    <span className="text-[11px] font-mono text-muted-foreground bg-muted/60 rounded px-1.5 py-0.5 shrink-0">
                      shell {formatCategoryRange(c)}
                    </span>
                    <span className="text-[11px] text-muted-foreground/80 shrink-0">
                      default {c.defaultShellPercent}%
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {usage === 0 ? "Not in use" : `${usage} product${usage === 1 ? "" : "s"}`}
                  </div>
                </div>
              </ListItemCard>
            );
          })}
        </ul>
      )}
    </div>
  );
}
