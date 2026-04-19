"use client";

/**
 * Fillings page — two tabs: Fillings, Categories
 * ────────────────────────────────────────────────
 * Fillings: existing reusable filling list (grouped by category).
 * Categories: configurable filling categories with a per-category
 *             `shelfStable` flag that drives production-wizard scaling.
 */

import { useState, useMemo, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { ListToolbar, FilterPanel, FilterChipGroup, ArchiveFilterChip, QuickAddForm, EmptyState, ListItemCard } from "@/components/pantry";
import { CategoryPicker } from "@/components/category-picker";
import {
  useFillings, saveFilling, useAllFillingStatuses,
  useFillingCategories, useFillingCategoryUsageCounts, saveFillingCategory,
} from "@/lib/hooks";
import { DEFAULT_FILLING_STATUSES, allergenLabel } from "@/types";
import type { Filling } from "@/types";
import { ChevronRight, ChevronDown } from "lucide-react";
import Link from "next/link";
import { useNShortcut } from "@/lib/use-n-shortcut";
import { usePersistedFilters } from "@/lib/use-persisted-filters";
import { shelfLifeBucket, SHELF_LIFE_BUCKET_LABELS, SHELF_LIFE_BUCKET_ORDER, type ShelfLifeBucket } from "@/lib/shelfLifeBuckets";

type FillingsTab = "fillings" | "categories";

const TABS: { id: FillingsTab; label: string }[] = [
  { id: "fillings", label: "Fillings" },
  { id: "categories", label: "Categories" },
];

export default function FillingsPage() {
  return (
    <Suspense fallback={null}>
      <FillingsPageInner />
    </Suspense>
  );
}

function FillingsPageInner() {
  const [tab, setTab] = usePersistedFilters("fillings-tab", { activeTab: "fillings" as FillingsTab });
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");

  // URL param wins over sessionStorage — lets detail pages return to a specific tab via
  // `/fillings?tab=categories` (used by the Back link on filling-category detail pages).
  useEffect(() => {
    if (tabParam === "fillings" || tabParam === "categories") {
      if (tab.activeTab !== tabParam) setTab("activeTab", tabParam);
    }
  }, [tabParam]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeTab = tab.activeTab;

  return (
    <div>
      <PageHeader title="Fillings" description="Reusable filling products and their categories" />

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

      {activeTab === "fillings" && <FillingsTab />}
      {activeTab === "categories" && <CategoriesTab />}
    </div>
  );
}

// ─── Fillings Tab ────────────────────────────────────────────────────────────

function FillingsTab() {
  const router = useRouter();
  const [f, setF] = usePersistedFilters("fillings", {
    search: "",
    showFilters: false,
    filterStatus: "",
    filterCategories: [] as string[],
    filterAllergens: [] as string[],
    filterExcludeAllergens: [] as string[],
    filterShelfLife: [] as ShelfLifeBucket[],
    showArchived: false,
  });
  const fillings = useFillings(f.showArchived);
  const allCategories = useFillingCategories();
  const existingStatuses = useAllFillingStatuses();
  const statusOptions = useMemo(() => {
    const all = [...new Set([...DEFAULT_FILLING_STATUSES, ...existingStatuses])].sort();
    return all.map((s) => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) }));
  }, [existingStatuses]);
  const categoryOptions = useMemo(() =>
    allCategories.map((c) => ({ value: c.name, label: c.name.split(" (")[0] })),
    [allCategories],
  );
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

  const filterCategoriesSet = useMemo(() => new Set(f.filterCategories), [f.filterCategories]);
  const filterAllergensSet = useMemo(() => new Set(f.filterAllergens), [f.filterAllergens]);
  const filterExcludeAllergensSet = useMemo(() => new Set(f.filterExcludeAllergens), [f.filterExcludeAllergens]);
  const filterShelfLifeSet = useMemo(() => new Set(f.filterShelfLife), [f.filterShelfLife]);
  const toggleShelfLifeBucket = (bucket: ShelfLifeBucket) => {
    const next = new Set(filterShelfLifeSet);
    if (next.has(bucket)) next.delete(bucket); else next.add(bucket);
    setF("filterShelfLife", Array.from(next));
  };

  const presentAllergenIds = useMemo(() => {
    const set = new Set<string>();
    for (const l of fillings) for (const a of (l.allergens ?? [])) set.add(a);
    return Array.from(set).sort();
  }, [fillings]);

  useNShortcut(() => setShowAdd(true), showAdd);

  const activeFilterCount =
    (f.filterStatus ? 1 : 0) +
    (filterCategoriesSet.size > 0 ? 1 : 0) +
    (filterAllergensSet.size > 0 ? 1 : 0) +
    (filterExcludeAllergensSet.size > 0 ? 1 : 0) +
    (filterShelfLifeSet.size > 0 ? 1 : 0) +
    (f.showArchived ? 1 : 0);

  function clearFilters() {
    setF("filterStatus", "");
    setF("filterCategories", []);
    setF("filterAllergens", []);
    setF("filterExcludeAllergens", []);
    setF("filterShelfLife", []);
    setF("showArchived", false);
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

  const searchLower = f.search.toLowerCase();
  const filtered = useMemo(() => {
    return fillings.filter((l) => {
      if (f.search && !l.name.toLowerCase().includes(searchLower) && !(l.category ?? "").toLowerCase().includes(searchLower)) return false;
      if (f.filterStatus && l.status !== f.filterStatus) return false;
      if (filterCategoriesSet.size > 0 && !filterCategoriesSet.has(l.category)) return false;
      if (filterAllergensSet.size > 0 && !(l.allergens ?? []).some((a) => filterAllergensSet.has(a))) return false;
      if (filterExcludeAllergensSet.size > 0 && (l.allergens ?? []).some((a) => filterExcludeAllergensSet.has(a))) return false;
      if (filterShelfLifeSet.size > 0 && !filterShelfLifeSet.has(shelfLifeBucket(l.shelfLifeWeeks))) return false;
      if (!f.showArchived && l.archived) return false;
      return true;
    });
  }, [fillings, f.search, searchLower, f.filterStatus, filterCategoriesSet, filterAllergensSet, filterExcludeAllergensSet, filterShelfLifeSet, f.showArchived]);

  // Group fillings by category, ordered by the live categories list (then any unknown labels by name)
  const grouped = useMemo(() => {
    // Single pass: bucket by category name
    const byCategory = new Map<string, Filling[]>();
    const uncategorized: Filling[] = [];
    for (const l of filtered) {
      if (!l.category) {
        uncategorized.push(l);
      } else {
        const arr = byCategory.get(l.category);
        if (arr) arr.push(l);
        else byCategory.set(l.category, [l]);
      }
    }

    const groups: { category: string; label: string; fillings: Filling[] }[] = [];
    const seen = new Set<string>();
    for (const cat of allCategories) {
      if (seen.has(cat.name)) continue;
      const catFillings = byCategory.get(cat.name);
      if (catFillings && catFillings.length > 0) {
        groups.push({ category: cat.name, label: cat.name, fillings: catFillings });
        seen.add(cat.name);
      }
    }
    // Any filling whose category isn't in the categories table (e.g. a stale/legacy label)
    const orphanNames = [...byCategory.keys()].filter((name) => !seen.has(name)).sort();
    for (const name of orphanNames) {
      groups.push({ category: name, label: name, fillings: byCategory.get(name)! });
    }
    if (uncategorized.length > 0) {
      groups.push({ category: "", label: "Uncategorized", fillings: uncategorized });
    }

    return groups;
  }, [filtered, allCategories]);

  function toggleCategory(cat: string) {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    const id = await saveFilling({
      name: newName.trim(),
      category: newCategory,
      source: "",
      description: "",
      allergens: [],
      instructions: "",
    });
    router.push(`/fillings/${encodeURIComponent(String(id))}?new=1`);
  }

  return (
    <div className="px-4 space-y-3 pb-6">
      <ListToolbar
        search={f.search}
        onSearchChange={(v) => setF("search", v)}
        searchPlaceholder="Search name, category…"
        searchAriaLabel="Search fillings"
        onAdd={() => setShowAdd(true)}
        addAriaLabel="Add filling"
        addTitle="Add filling (n)"
        showFilters
        filterPanelOpen={f.showFilters}
        onToggleFilters={() => setF("showFilters", !f.showFilters)}
        activeFilterCount={activeFilterCount}
      />

      {f.showFilters && (
        <FilterPanel activeFilterCount={activeFilterCount} onClearAll={clearFilters}>
          <FilterChipGroup
            label="Status"
            options={statusOptions}
            value={f.filterStatus}
            defaultValue=""
            onChange={(v) => setF("filterStatus", v)}
          />
          <FilterChipGroup
            label="Category"
            options={categoryOptions}
            multi
            selected={filterCategoriesSet}
            onToggle={toggleFilterCategory}
          />
          {presentAllergenIds.length > 0 && (
            <FilterChipGroup
              label="Contains allergen"
              options={presentAllergenIds.map((id) => ({ value: id, label: allergenLabel(id) }))}
              multi
              selected={filterAllergensSet}
              onToggle={toggleFilterAllergen}
            />
          )}
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
          <FilterChipGroup
            label="Shelf life"
            options={SHELF_LIFE_BUCKET_ORDER.map((b) => ({ value: b, label: SHELF_LIFE_BUCKET_LABELS[b] }))}
            multi
            selected={filterShelfLifeSet}
            onToggle={(v) => toggleShelfLifeBucket(v as ShelfLifeBucket)}
          />
          <ArchiveFilterChip
            value={f.showArchived}
            onChange={(v) => setF("showArchived", v)}
          />
        </FilterPanel>
      )}

      {showAdd && (
        <form onSubmit={handleAdd} className="rounded-lg border border-border bg-card p-3 space-y-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Filling name (e.g. Dark ganache, Praline crunch)…"
            aria-label="Filling name"
            required
            autoFocus
            className="input"
          />
          <CategoryPicker
            category={newCategory}
            onCategoryChange={setNewCategory}
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={!newName.trim()}
              className="btn-primary flex-1 py-2"
            >
              Create Filling
            </button>
            <button
              type="button"
              onClick={() => { setShowAdd(false); setNewName(""); setNewCategory(""); }}
              className="btn-secondary px-4 py-2"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {filtered.length === 0 ? (
        <p className="text-muted-foreground text-sm py-8 text-center">
          {fillings.length === 0 && activeFilterCount === 0
            ? "No fillings yet. Tap + to create your first filling product."
            : "No fillings match your filters."}
        </p>
      ) : (
        <div className="space-y-4">
          <div className="flex justify-end gap-3">
            <button onClick={() => setCollapsedCategories(new Set(grouped.map((g) => g.category)))} className="text-xs text-muted-foreground">Collapse all</button>
            <button onClick={() => setCollapsedCategories(new Set())} className="text-xs text-muted-foreground">Expand all</button>
          </div>
          {grouped.map((group) => {
            const isCollapsed = collapsedCategories.has(group.category);
            return (
              <div key={group.category}>
                <button
                  onClick={() => toggleCategory(group.category)}
                  aria-expanded={!isCollapsed}
                  className="flex items-center gap-2 w-full text-left mb-2"
                >
                  <ChevronDown aria-hidden="true" className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform duration-150 ${isCollapsed ? "-rotate-90" : ""}`} />
                  <h2 className="text-sm font-semibold text-primary">{group.label}</h2>
                  <span className="text-xs text-muted-foreground">({group.fillings.length})</span>
                </button>
                {!isCollapsed && (
                  <ul className="space-y-2 ml-6">
                    {group.fillings.map((filling) => (
                      <li
                        key={filling.id}
                        className={`rounded-lg border bg-card ${filling.archived ? "border-muted opacity-60" : "border-border"}`}
                        style={{ contentVisibility: "auto", containIntrinsicSize: "0 72px" }}
                      >
                        <Link
                          href={`/fillings/${encodeURIComponent(filling.id ?? '')}`}
                          className="flex items-center gap-3 p-3 min-w-0"
                        >
                          <div className="min-w-0 flex-1">
                            <h3 className="font-medium text-sm truncate">
                              {filling.name}
                              {filling.archived && <span className="ml-1.5 text-[10px] text-muted-foreground font-normal">(archived)</span>}
                            </h3>
                            {filling.description && (
                              <p className="text-xs text-muted-foreground truncate mt-0.5">{filling.description}</p>
                            )}
                            <div className="flex flex-wrap gap-1 mt-1">
                              {filling.status && (
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                                  filling.status === "confirmed" ? "bg-success-muted text-success" :
                                  filling.status === "testing"   ? "bg-warning-muted text-warning" :
                                  filling.status === "to try"    ? "bg-muted text-muted-foreground" :
                                                                   "bg-sky-50 text-sky-700 border border-sky-200"
                                }`}>
                                  {filling.status.charAt(0).toUpperCase() + filling.status.slice(1)}
                                </span>
                              )}
                              {filling.allergens.map((a) => (
                                <span
                                  key={a}
                                  className="rounded-full border border-amber-300 bg-amber-50 text-amber-800 px-2 py-0.5 text-[10px]"
                                >
                                  {allergenLabel(a)}
                                </span>
                              ))}
                            </div>
                          </div>
                          <ChevronRight aria-hidden="true" className="w-4 h-4 text-muted-foreground shrink-0" />
                        </Link>
                      </li>
                    ))}
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

// ─── Categories Tab ──────────────────────────────────────────────────────────

function CategoriesTab() {
  const router = useRouter();
  const [f, setF] = usePersistedFilters("filling-categories", {
    search: "",
    showFilters: false,
    showArchived: false,
  });

  const categories = useFillingCategories(f.showArchived);
  const usageCounts = useFillingCategoryUsageCounts();

  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newShelfStable, setNewShelfStable] = useState(false);

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
    const id = await saveFillingCategory({
      name: newName.trim(),
      shelfStable: newShelfStable,
    });
    setNewName("");
    setNewShelfStable(false);
    setShowAdd(false);
    router.push(`/fillings/categories/${encodeURIComponent(id)}?new=1`);
  }

  return (
    <div className="px-4 space-y-3 pb-6">
      <ListToolbar
        search={f.search}
        onSearchChange={(v) => setF("search", v)}
        searchPlaceholder="Search categories…"
        searchAriaLabel="Search filling categories"
        onAdd={() => setShowAdd(true)}
        addAriaLabel="Add filling category"
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
          onCancel={() => { setShowAdd(false); setNewName(""); setNewShelfStable(false); }}
          submitLabel="Create Category"
          canSubmit={!!newName.trim()}
        >
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") { setShowAdd(false); setNewName(""); setNewShelfStable(false); } }}
            placeholder="Category name (e.g. Marmalades)…"
            aria-label="Category name"
            className="input w-full"
            autoFocus
            required
          />
          <label className="flex items-start gap-2 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              checked={newShelfStable}
              onChange={(e) => setNewShelfStable(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium">Shelf-stable</span>
              <span className="block text-xs text-muted-foreground">
                The production wizard will ask for a batch multiplier instead of scaling the recipe to the moulds.
              </span>
            </span>
          </label>
        </QuickAddForm>
      )}

      {filtered.length === 0 && (
        <EmptyState
          hasData={categories.length > 0}
          emptyMessage="No filling categories yet. Tap + to add your first."
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
                href={`/fillings/categories/${encodeURIComponent(c.id!)}`}
                archived={c.archived}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm truncate">{c.name}</span>
                    {c.shelfStable && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                        Shelf-stable
                      </span>
                    )}
                    {c.archived && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">Archived</span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {usage === 0 ? "No fillings" : `${usage} filling${usage === 1 ? "" : "s"}`}
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
