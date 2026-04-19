"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { useMoulds, saveMould } from "@/lib/hooks";
import { ListToolbar, FilterPanel, FilterChipGroup, ArchiveFilterChip, ListItemCard } from "@/components/pantry";
import { useNShortcut } from "@/lib/use-n-shortcut";
import { usePersistedFilters } from "@/lib/use-persisted-filters";

const CAVITY_WEIGHT_OPTIONS = [
  { value: "1-10", label: "≤ 10 g" },
  { value: "11-15", label: "11–15 g" },
  { value: "16-25", label: "16–25 g" },
  { value: "26+", label: "26+ g" },
];

function matchesCavityWeight(wt: number, filter: string): boolean {
  if (wt <= 0) return false;
  if (filter === "1-10") return wt <= 10;
  if (filter === "11-15") return wt >= 11 && wt <= 15;
  if (filter === "16-25") return wt >= 16 && wt <= 25;
  if (filter === "26+") return wt >= 26;
  return true;
}

const CAVITY_COUNT_OPTIONS = [
  { value: "1-15", label: "≤ 15" },
  { value: "16-24", label: "16–24" },
  { value: "25-36", label: "25–36" },
  { value: "37+", label: "37+" },
];

function matchesCavityCount(count: number, filter: string): boolean {
  if (count <= 0) return false;
  if (filter === "1-15") return count <= 15;
  if (filter === "16-24") return count >= 16 && count <= 24;
  if (filter === "25-36") return count >= 25 && count <= 36;
  if (filter === "37+") return count >= 37;
  return true;
}

const OWNED_OPTIONS = [
  { value: "1", label: "1" },
  { value: "2-3", label: "2–3" },
  { value: "4+", label: "4+" },
];

function matchesOwned(qty: number | undefined, filter: string): boolean {
  const n = qty ?? 0;
  if (filter === "1") return n === 1;
  if (filter === "2-3") return n >= 2 && n <= 3;
  if (filter === "4+") return n >= 4;
  return true;
}

export default function MouldsPage() {
  const router = useRouter();
  const [f, setF] = usePersistedFilters("moulds", {
    search: "",
    showFilters: false,
    showArchived: false,
    filterBrands: [] as string[],
    filterCavityWeight: "" as string,
    filterCavityCount: "" as string,
    filterOwned: "" as string,
  });
  const moulds = useMoulds(f.showArchived);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");

  useNShortcut(() => setShowAdd(true), showAdd);

  const filterBrandsSet = useMemo(() => new Set(f.filterBrands), [f.filterBrands]);

  const allBrands = useMemo(() => {
    const set = new Set<string>();
    for (const m of moulds) if (m.brand) set.add(m.brand);
    return Array.from(set).sort();
  }, [moulds]);

  const brandOptions = useMemo(
    () => allBrands.map((b) => ({ value: b, label: b })),
    [allBrands],
  );

  const activeFilterCount =
    (filterBrandsSet.size > 0 ? 1 : 0) +
    (f.filterCavityWeight ? 1 : 0) +
    (f.filterCavityCount ? 1 : 0) +
    (f.filterOwned ? 1 : 0) +
    (f.showArchived ? 1 : 0);

  function clearFilters() {
    setF("filterBrands", []);
    setF("filterCavityWeight", "");
    setF("filterCavityCount", "");
    setF("filterOwned", "");
    setF("showArchived", false);
  }

  function toggleFilterBrand(brand: string) {
    const next = new Set(filterBrandsSet);
    if (next.has(brand)) next.delete(brand); else next.add(brand);
    setF("filterBrands", Array.from(next));
  }

  const filtered = useMemo(() => {
    return moulds.filter((m) => {
      if (f.search && !m.name.toLowerCase().includes(f.search.toLowerCase()) && !(m.brand ?? "").toLowerCase().includes(f.search.toLowerCase())) return false;
      if (filterBrandsSet.size > 0 && !filterBrandsSet.has(m.brand ?? "")) return false;
      if (f.filterCavityWeight && !matchesCavityWeight(m.cavityWeightG, f.filterCavityWeight)) return false;
      if (f.filterCavityCount && !matchesCavityCount(m.numberOfCavities, f.filterCavityCount)) return false;
      if (f.filterOwned && !matchesOwned(m.quantityOwned, f.filterOwned)) return false;
      return true;
    });
  }, [moulds, f.search, filterBrandsSet, f.filterCavityWeight, f.filterCavityCount, f.filterOwned]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    const id = await saveMould({
      name: newName.trim(),
      cavityWeightG: 0,
      numberOfCavities: 0,
    });
    router.push(`/moulds/${encodeURIComponent(String(id))}?new=1`);
  }

  return (
    <div>
      <PageHeader title="Moulds" description="Your mould collection" />
      <div className="px-4 space-y-3 pb-6">
        <ListToolbar
          search={f.search}
          onSearchChange={(v) => setF("search", v)}
          searchPlaceholder="Search name or brand…"
          searchAriaLabel="Search moulds"
          onAdd={() => setShowAdd(true)}
          addAriaLabel="Add mould"
          addTitle="Add mould (n)"
          showFilters
          filterPanelOpen={f.showFilters}
          onToggleFilters={() => setF("showFilters", !f.showFilters)}
          activeFilterCount={activeFilterCount}
        />

        {f.showFilters && (
          <FilterPanel activeFilterCount={activeFilterCount} onClearAll={clearFilters}>
            {brandOptions.length > 0 && (
              <FilterChipGroup
                label="Brand"
                options={brandOptions}
                multi
                selected={filterBrandsSet}
                onToggle={toggleFilterBrand}
              />
            )}
            <FilterChipGroup
              label="Cavity weight"
              options={CAVITY_WEIGHT_OPTIONS}
              value={f.filterCavityWeight}
              defaultValue=""
              onChange={(v) => setF("filterCavityWeight", v)}
            />
            <FilterChipGroup
              label="Cavities"
              options={CAVITY_COUNT_OPTIONS}
              value={f.filterCavityCount}
              defaultValue=""
              onChange={(v) => setF("filterCavityCount", v)}
            />
            <FilterChipGroup
              label="Moulds owned"
              options={OWNED_OPTIONS}
              value={f.filterOwned}
              defaultValue=""
              onChange={(v) => setF("filterOwned", v)}
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
              placeholder="Mould name *"
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
                Create Mould
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
            {moulds.length === 0
              ? "No moulds yet. Tap + to add your first."
              : "No moulds match your search."}
          </p>
        ) : (
          <ul className="space-y-2">
            {filtered.map((mould) => (
              <ListItemCard
                key={mould.id}
                href={`/moulds/${encodeURIComponent(mould.id ?? '')}`}
                archived={mould.archived}
              >
                {mould.photo ? (
                  <img src={mould.photo} alt={mould.name} className="w-10 h-10 rounded-md object-cover shrink-0" />
                ) : (
                  <div className="w-10 h-10 rounded-md bg-muted shrink-0 flex items-center justify-center text-muted-foreground text-base font-light">
                    ◻
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h3 className="font-medium text-sm truncate">{mould.name}</h3>
                    {mould.archived && (
                      <span className="text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
                        archived
                      </span>
                    )}
                  </div>
                  {mould.brand && (
                    <p className="text-xs text-muted-foreground">{mould.brand}</p>
                  )}
                  {mould.cavityWeightG > 0 && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {mould.cavityWeightG} g · {mould.numberOfCavities} cavities
                    </p>
                  )}
                </div>
              </ListItemCard>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
