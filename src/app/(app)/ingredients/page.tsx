"use client";

import { useState, useMemo, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { useIngredients, saveIngredient, setIngredientLowStock, useIngredientCategories, useIngredientCategoryUsageCounts, saveIngredientCategory, useIngredientCategoryNames } from "@/lib/hooks";
import { ALLERGEN_LIST, DIET_LIST, costPerGram, allergenLabel, type Ingredient } from "@/types";
import { Plus, Search, ChevronRight, ChevronDown, SlidersHorizontal, X } from "lucide-react";
import Link from "next/link";
import { ListToolbar, FilterPanel, ArchiveFilterChip, QuickAddForm, EmptyState, ListItemCard, MultiSelectDropdown, LowStockFlagButton, StockBadge, GroupStockBadge } from "@/components/pantry";
import { usePersistedFilters } from "@/lib/use-persisted-filters";
import { useNShortcut } from "@/lib/use-n-shortcut";

const VALID_TAGS = new Set<string>([...ALLERGEN_LIST, ...DIET_LIST]);

function hasComposition(ing: { cacaoFat: number; sugar: number; milkFat: number; water: number; solids: number; otherFats: number; alcohol?: number }): boolean {
  return (ing.cacaoFat + ing.sugar + ing.milkFat + ing.water + ing.solids + ing.otherFats + (ing.alcohol ?? 0)) > 0;
}

function hasPricing(ing: Ingredient): boolean {
  return costPerGram(ing) !== null;
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(date));
}

type StockFilter = "all" | "in-stock" | "low-stock" | "ordered" | "out-of-stock";
type CompositionFilter = "all" | "has" | "missing";
type PricingFilter = "all" | "has" | "missing";

function getStockStatus(ing: { lowStock?: boolean; lowStockOrdered?: boolean; outOfStock?: boolean }): "in-stock" | "low-stock" | "ordered" | "out-of-stock" {
  if (ing.outOfStock) return "out-of-stock";
  if (ing.lowStock && ing.lowStockOrdered) return "ordered";
  if (ing.lowStock) return "low-stock";
  return "in-stock";
}

type IngredientsMainTab = "ingredients" | "categories";
const TABS: { id: IngredientsMainTab; label: string }[] = [
  { id: "ingredients", label: "Ingredients" },
  { id: "categories", label: "Categories" },
];

export default function IngredientsPage() {
  return (
    <Suspense fallback={null}>
      <IngredientsPageInner />
    </Suspense>
  );
}

function IngredientsPageInner() {
  const [tab, setTab] = usePersistedFilters("ingredients-tab", { activeTab: "ingredients" as IngredientsMainTab });
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");

  // URL param wins over sessionStorage (so "Back" links from a category detail land on the right tab)
  useEffect(() => {
    if (tabParam === "ingredients" || tabParam === "categories") {
      if (tab.activeTab !== tabParam) setTab("activeTab", tabParam);
    }
  }, [tabParam]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeTab = tab.activeTab;

  return (
    <div>
      <PageHeader title="Ingredients" description="Your ingredient library and the categories that group them" />

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

      {activeTab === "ingredients" && <IngredientsTab />}
      {activeTab === "categories" && <IngredientCategoriesTab />}
    </div>
  );
}

function IngredientsTab() {
  const router = useRouter();
  const [f, setF] = usePersistedFilters("ingredients", {
    search: "",
    showFilters: false,
    filterStock: "all" as StockFilter,
    filterCategories: [] as string[],
    filterManufacturers: [] as string[],
    filterComposition: "all" as CompositionFilter,
    filterPricing: "all" as PricingFilter,
    filterAllergens: [] as string[],
    filterExcludeAllergens: [] as string[],
    filterAllergenData: "all" as "all" | "none",
    showArchived: false,
  });
  const ingredients = useIngredients(f.showArchived);
  const categoryNames = useIngredientCategoryNames();
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

  useNShortcut(() => setShowAdd(true), showAdd);

  const CATEGORY_ORDER = useMemo(() => ["Uncategorised", ...categoryNames], [categoryNames]);

  const filterCategoriesSet = useMemo(() => new Set(f.filterCategories), [f.filterCategories]);
  const filterManufacturersSet = useMemo(() => new Set(f.filterManufacturers), [f.filterManufacturers]);
  const filterAllergensSet = useMemo(() => new Set(f.filterAllergens), [f.filterAllergens]);
  const filterExcludeAllergensSet = useMemo(() => new Set(f.filterExcludeAllergens), [f.filterExcludeAllergens]);

  // Derive unique manufacturers from current records
  const allManufacturers = useMemo(() => {
    const set = new Set<string>();
    for (const i of ingredients) if (i.manufacturer) set.add(i.manufacturer);
    return Array.from(set).sort();
  }, [ingredients]);

  // Derive allergens present in at least one ingredient
  const presentAllergenIds = useMemo(() => {
    const set = new Set<string>();
    for (const i of ingredients) for (const a of i.allergens) set.add(a);
    return Array.from(set).sort();
  }, [ingredients]);

  const activeFilterCount =
    (f.filterStock !== "all" ? 1 : 0) +
    (filterCategoriesSet.size > 0 ? 1 : 0) +
    (filterManufacturersSet.size > 0 ? 1 : 0) +
    (f.filterComposition !== "all" ? 1 : 0) +
    (f.filterPricing !== "all" ? 1 : 0) +
    (filterAllergensSet.size > 0 ? 1 : 0) +
    (filterExcludeAllergensSet.size > 0 ? 1 : 0) +
    (f.filterAllergenData !== "all" ? 1 : 0) +
    (f.showArchived ? 1 : 0);

  const filtered = useMemo(() => {
    return ingredients.filter((i) => {
      if (f.search && !i.name.toLowerCase().includes(f.search.toLowerCase()) && !(i.manufacturer ?? "").toLowerCase().includes(f.search.toLowerCase())) return false;
      if (f.filterStock === "low-stock" && (!i.lowStock || i.outOfStock)) return false;
      else if (f.filterStock !== "low-stock" && f.filterStock !== "all" && getStockStatus(i) !== f.filterStock) return false;
      if (filterCategoriesSet.size > 0 && !filterCategoriesSet.has(i.category || "Uncategorised")) return false;
      if (filterManufacturersSet.size > 0 && !filterManufacturersSet.has(i.manufacturer ?? "")) return false;
      if (f.filterComposition === "has" && !hasComposition(i)) return false;
      if (f.filterComposition === "missing" && hasComposition(i)) return false;
      if (f.filterPricing === "has" && !hasPricing(i)) return false;
      if (f.filterPricing === "missing" && hasPricing(i)) return false;
      if (filterAllergensSet.size > 0 && !i.allergens.some((a) => filterAllergensSet.has(a))) return false;
      if (filterExcludeAllergensSet.size > 0 && i.allergens.some((a) => filterExcludeAllergensSet.has(a))) return false;
      if (f.filterAllergenData === "none" && i.allergens.length > 0) return false;
      return true;
    });
  }, [ingredients, f.search, f.filterStock, filterCategoriesSet, filterManufacturersSet, f.filterComposition, f.filterPricing, filterAllergensSet, filterExcludeAllergensSet, f.filterAllergenData]);

  const grouped = useMemo(() => {
    // Single pass: bucket by category name.
    const byCategory = new Map<string, typeof filtered>();
    for (const i of filtered) {
      const key = i.category || "Uncategorised";
      const arr = byCategory.get(key);
      if (arr) arr.push(i);
      else byCategory.set(key, [i]);
    }
    // Show categories from DB order first, then any unrecognised categories at the end
    const ordered = CATEGORY_ORDER
      .map((cat) => ({ category: cat, items: byCategory.get(cat) ?? [] }))
      .filter(({ items }) => items.length > 0);
    // Catch ingredients with category names not in the DB (e.g. custom categories from pre-migration)
    for (const [cat, items] of byCategory) {
      if (!CATEGORY_ORDER.includes(cat)) {
        ordered.push({ category: cat, items });
      }
    }
    return ordered;
  }, [filtered, CATEGORY_ORDER]);

  function toggleCategory(cat: string) {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  }

  function toggleFilterCategory(cat: string) {
    const next = new Set(filterCategoriesSet);
    if (next.has(cat)) next.delete(cat); else next.add(cat);
    setF("filterCategories", Array.from(next));
  }

  function toggleFilterAllergen(allergen: string) {
    const next = new Set(filterAllergensSet);
    if (next.has(allergen)) next.delete(allergen); else next.add(allergen);
    setF("filterAllergens", Array.from(next));
  }

  function toggleExcludeAllergen(allergen: string) {
    const next = new Set(filterExcludeAllergensSet);
    if (next.has(allergen)) next.delete(allergen); else next.add(allergen);
    setF("filterExcludeAllergens", Array.from(next));
  }

  function clearFilters() {
    setF("filterStock", "all");
    setF("filterCategories", []);
    setF("filterManufacturers", []);
    setF("filterComposition", "all");
    setF("filterPricing", "all");
    setF("filterAllergens", []);
    setF("filterExcludeAllergens", []);
    setF("filterAllergenData", "all");
    setF("showArchived", false);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    const id = await saveIngredient({
      name: newName.trim(),
      manufacturer: "",
      source: "",
      cost: 0,
      notes: "",
      cacaoFat: 0,
      sugar: 0,
      milkFat: 0,
      water: 0,
      solids: 0,
      otherFats: 0,
      allergens: [],
    });
    router.push(`/ingredients/${encodeURIComponent(String(id))}?new=1`);
  }

  const STOCK_OPTIONS: { value: StockFilter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "in-stock", label: "In stock" },
    { value: "low-stock", label: "Low stock" },
    { value: "out-of-stock", label: "Out of stock" },
    { value: "ordered", label: "Ordered" },
  ];

  return (
    <div className="px-4 space-y-3 pb-6">
      <div className="flex gap-2">
        <div className="flex-1 relative min-w-0">
          <Search aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={f.search}
            onChange={(e) => setF("search", e.target.value)}
            placeholder="Search name or manufacturer…"
            aria-label="Search ingredients"
            className="input !pl-9"
          />
        </div>
        <button
          onClick={() => setF("showFilters", !f.showFilters)}
          className={`relative rounded-full border p-2 transition-colors ${f.showFilters ? "bg-primary text-primary-foreground border-primary" : "border-border bg-background"}`}
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
          title="Add ingredient (n)"
          className="rounded-full bg-accent text-accent-foreground p-2"
          aria-label="Add ingredient"
        >
          <Plus className="w-5 h-5" />
        </button>
      </div>

      {f.showFilters && (
        <div className="rounded-lg border border-border bg-card p-3 space-y-3">
          {/* Stock status */}
          <div>
            <p className="text-xs text-muted-foreground mb-1">Stock status</p>
            <div className="flex flex-wrap gap-1">
              {STOCK_OPTIONS.map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => setF("filterStock", f.filterStock === value ? "all" : value)}
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${f.filterStock === value && value !== "all" ? "bg-accent text-accent-foreground" : value === "all" && f.filterStock === "all" ? "bg-accent text-accent-foreground" : "border border-border"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Category */}
          <div>
            <p className="text-xs text-muted-foreground mb-1">Category</p>
            <MultiSelectDropdown
              placeholder="All categories"
              options={["Uncategorised", ...categoryNames]}
              selected={filterCategoriesSet}
              onToggle={toggleFilterCategory}
            />
          </div>

          {/* Manufacturer */}
          {allManufacturers.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Manufacturer</p>
              <MultiSelectDropdown
                placeholder="All manufacturers"
                options={allManufacturers}
                selected={filterManufacturersSet}
                onToggle={(m) => {
                  const next = new Set(filterManufacturersSet);
                  if (next.has(m)) next.delete(m); else next.add(m);
                  setF("filterManufacturers", Array.from(next));
                }}
              />
            </div>
          )}

          {/* Composition */}
          <div>
            <p className="text-xs text-muted-foreground mb-1">Composition data</p>
            <div className="flex gap-1">
              {(["all", "has", "missing"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setF("filterComposition", f.filterComposition === v ? "all" : v)}
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${f.filterComposition === v ? "bg-accent text-accent-foreground" : "border border-border"}`}
                >
                  {v === "all" ? "Any" : v === "has" ? "Has composition" : "Missing"}
                </button>
              ))}
            </div>
          </div>

          {/* Pricing */}
          <div>
            <p className="text-xs text-muted-foreground mb-1">Pricing data</p>
            <div className="flex gap-1">
              {(["all", "has", "missing"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setF("filterPricing", f.filterPricing === v ? "all" : v)}
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${f.filterPricing === v ? "bg-accent text-accent-foreground" : "border border-border"}`}
                >
                  {v === "all" ? "Any" : v === "has" ? "Has pricing" : "Missing pricing"}
                </button>
              ))}
            </div>
          </div>

          {/* Contains allergen */}
          {presentAllergenIds.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Contains allergen</p>
              <div className="flex flex-wrap gap-1">
                {presentAllergenIds.map((id) => (
                  <button
                    key={id}
                    onClick={() => toggleFilterAllergen(id)}
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${filterAllergensSet.has(id) ? "bg-accent text-accent-foreground" : "border border-border"}`}
                  >
                    {allergenLabel(id)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Exclude allergens */}
          {presentAllergenIds.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Exclude allergens</p>
              <div className="flex flex-wrap gap-1">
                {presentAllergenIds.map((id) => (
                  <button
                    key={id}
                    onClick={() => toggleExcludeAllergen(id)}
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${filterExcludeAllergensSet.has(id) ? "bg-destructive text-destructive-foreground" : "border border-border"}`}
                  >
                    {allergenLabel(id)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Allergen data */}
          <div>
            <p className="text-xs text-muted-foreground mb-1">Allergen data</p>
            <div className="flex gap-1">
              <button
                onClick={() => setF("filterAllergenData", f.filterAllergenData === "none" ? "all" : "none")}
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${f.filterAllergenData === "none" ? "bg-accent text-accent-foreground" : "border border-border"}`}
              >
                No allergens recorded
              </button>
            </div>
          </div>

          {/* Archived */}
          <ArchiveFilterChip
            value={f.showArchived}
            onChange={(v) => setF("showArchived", v)}
          />

          {activeFilterCount > 0 && (
            <button
              onClick={clearFilters}
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
            placeholder="Ingredient name…"
            aria-label="Ingredient name"
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
              Create Ingredient
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
          {ingredients.length === 0
            ? "No ingredients yet. Tap + to add your first."
            : "No ingredients match your filters."}
        </p>
      ) : (
        <div className="space-y-4">
          <div className="flex justify-end gap-3">
            <button onClick={() => setCollapsedCategories(new Set(grouped.map((g) => g.category)))} className="text-xs text-muted-foreground">Collapse all</button>
            <button onClick={() => setCollapsedCategories(new Set())} className="text-xs text-muted-foreground">Expand all</button>
          </div>
          {grouped.map(({ category, items }) => {
            const isCollapsed = !f.search && activeFilterCount === 0 && collapsedCategories.has(category);
            return (
              <div key={category}>
                <button
                  onClick={() => toggleCategory(category)}
                  aria-expanded={!isCollapsed}
                  className="flex items-center gap-2 w-full text-left mb-2"
                >
                  <ChevronDown aria-hidden="true" className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${isCollapsed ? "-rotate-90" : ""}`} />
                  <h2 className="text-sm font-semibold text-primary">{category}</h2>
                  <span className="text-xs text-muted-foreground">({items.length})</span>
                  <GroupStockBadge
                    outCount={items.filter((i) => i.outOfStock).length}
                    lowCount={items.filter((i) => i.lowStock && !i.outOfStock).length}
                  />
                </button>
                {!isCollapsed && (
                  <ul className="space-y-2 ml-6">
                    {items.map((ing) => {
                      const stockStatus = getStockStatus(ing);
                      return (
                        <li
                          key={ing.id}
                          className={`rounded-lg border bg-card ${stockStatus === "out-of-stock" ? "border-status-alert-edge" : stockStatus === "low-stock" ? "border-status-warn-edge" : ing.archived ? "border-border/50 opacity-60" : "border-border"}`}
                          style={{ contentVisibility: "auto", containIntrinsicSize: "0 64px" }}
                        >
                          <div className="flex items-center min-w-0">
                            <Link
                              href={`/ingredients/${encodeURIComponent(ing.id ?? '')}`}
                              className="flex items-center gap-3 p-3 min-w-0 flex-1"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-baseline gap-1.5 flex-wrap">
                                  <h3 className="font-medium text-sm">
                                    {ing.name}
                                    {ing.archived && (
                                      <span className="ml-1.5 text-[10px] font-normal text-muted-foreground align-middle">archived</span>
                                    )}
                                  </h3>
                                  {ing.commercialName && (
                                    <span className="text-xs text-muted-foreground italic truncate">{ing.commercialName}</span>
                                  )}
                                  {!ing.archived && <StockBadge status={stockStatus} />}
                                </div>
                                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                  {ing.manufacturer && (
                                    <span className="text-xs text-muted-foreground">{ing.manufacturer}</span>
                                  )}
                                  {ing.manufacturer && (hasComposition(ing) || ing.updatedAt) && (
                                    <span className="text-muted-foreground/40 text-xs">·</span>
                                  )}
                                  {hasComposition(ing) ? (
                                    <span className="text-[10px] font-medium text-success bg-success-muted px-1.5 py-0.5 rounded-full">composition ✓</span>
                                  ) : (
                                    <span className="text-[10px] text-muted-foreground/60">no composition</span>
                                  )}
                                  {hasPricing(ing) ? null : (
                                    <span className="text-[10px] text-status-warn bg-status-warn-bg px-1.5 py-0.5 rounded-full">no pricing</span>
                                  )}
                                  {ing.updatedAt && (
                                    <>
                                      <span className="text-muted-foreground/40 text-xs">·</span>
                                      <span className="text-[10px] text-muted-foreground">{formatDate(ing.updatedAt)}</span>
                                    </>
                                  )}
                                </div>
                                {ing.allergens.filter((a) => VALID_TAGS.has(a)).length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {ing.allergens.filter((a) => VALID_TAGS.has(a)).map((a) => (
                                      <span key={a} className="rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[10px]">
                                        {allergenLabel(a)}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                              <ChevronRight aria-hidden="true" className="w-4 h-4 text-muted-foreground shrink-0" />
                            </Link>
                            <LowStockFlagButton
                              flagged={ing.lowStock}
                              itemName={ing.name}
                              onFlag={() => setIngredientLowStock(ing.id!, true)}
                              onUnflag={() => setIngredientLowStock(ing.id!, false)}
                            />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function IngredientCategoriesTab() {
  const router = useRouter();
  const [f, setF] = usePersistedFilters("ingredient-categories", {
    search: "",
    showFilters: false,
    showArchived: false,
  });

  const categories = useIngredientCategories(f.showArchived);
  const usageCounts = useIngredientCategoryUsageCounts();

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
    const id = await saveIngredientCategory({
      name: newName.trim(),
    });
    setNewName("");
    setShowAdd(false);
    router.push(`/ingredients/categories/${encodeURIComponent(id)}?new=1`);
  }

  return (
    <div className="px-4 space-y-3 pb-6">
      <ListToolbar
        search={f.search}
        onSearchChange={(v) => setF("search", v)}
        searchPlaceholder="Search categories…"
        searchAriaLabel="Search ingredient categories"
        onAdd={() => setShowAdd(true)}
        addAriaLabel="Add ingredient category"
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
            placeholder="Category name (e.g. Emulsifiers)…"
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
          emptyMessage="No ingredient categories yet. Tap + to add your first."
          filteredMessage="No categories match your search."
        />
      )}

      {filtered.length > 0 && (
        <ul className="space-y-2">
          {filtered.map((c) => {
            const usage = usageCounts.get(c.name) ?? 0;
            return (
              <ListItemCard
                key={c.id}
                href={`/ingredients/categories/${encodeURIComponent(c.id!)}`}
                archived={c.archived}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm truncate">{c.name}</span>
                    {c.archived && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">Archived</span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {usage === 0 ? "Not in use" : `${usage} ingredient${usage === 1 ? "" : "s"}`}
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
