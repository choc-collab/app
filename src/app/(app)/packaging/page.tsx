"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { usePackagingList, useAllPackagingOrders, savePackaging, setPackagingLowStock, useCurrencySymbol } from "@/lib/hooks";
import { Package } from "lucide-react";
import { ListToolbar, FilterPanel, FilterChipGroup, ArchiveFilterChip, LowStockFlagButton, StockBadge, PantryTableHeader, PantryTableRow, type PantryTableColumn } from "@/components/pantry";
import type { PackagingOrder } from "@/types";
import { useNShortcut } from "@/lib/use-n-shortcut";
import { usePersistedFilters } from "@/lib/use-persisted-filters";

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(date));
}

const PACKAGING_GRID = "minmax(200px,1.6fr) 100px 80px minmax(120px,1fr) 100px 90px 20px";
const PACKAGING_COLUMNS: PantryTableColumn[] = [
  { key: "name", label: "Packaging" },
  { key: "stock", label: "Stock" },
  { key: "capacity", label: "Capacity" },
  { key: "manufacturer", label: "Manufacturer" },
  { key: "price", label: "Price/unit", align: "right" },
  { key: "updated", label: "Updated", align: "right" },
];

type StockFilter = "all" | "in-stock" | "low-stock" | "out-of-stock" | "ordered";

const STOCK_OPTIONS: { value: StockFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "in-stock", label: "In stock" },
  { value: "low-stock", label: "Low stock" },
  { value: "out-of-stock", label: "Out of stock" },
  { value: "ordered", label: "Ordered" },
];

const CAPACITY_OPTIONS = [
  { value: "1-4", label: "1–4" },
  { value: "5-9", label: "5–9" },
  { value: "10+", label: "10+" },
];

function matchesCapacity(capacity: number, filter: string): boolean {
  if (filter === "1-4") return capacity >= 1 && capacity <= 4;
  if (filter === "5-9") return capacity >= 5 && capacity <= 9;
  if (filter === "10+") return capacity >= 10;
  return true;
}

export default function PackagingPage() {
  const router = useRouter();
  const [f, setF] = usePersistedFilters("packaging", {
    search: "",
    showFilters: false,
    showArchived: false,
    filterStock: "all" as StockFilter,
    filterCapacity: "" as string,
  });
  const packaging = usePackagingList(f.showArchived);
  const allOrders = useAllPackagingOrders();
  const sym = useCurrencySymbol();
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCapacity, setNewCapacity] = useState("");

  useNShortcut(() => setShowAdd(true), showAdd);

  const activeFilterCount =
    (f.filterStock !== "all" ? 1 : 0) +
    (f.filterCapacity ? 1 : 0) +
    (f.showArchived ? 1 : 0);

  function clearFilters() {
    setF("filterStock", "all");
    setF("filterCapacity", "");
    setF("showArchived", false);
  }

  const latestOrderMap = useMemo(() => {
    const map = new Map<string, PackagingOrder>();
    for (const order of allOrders) {
      const existing = map.get(order.packagingId);
      if (!existing || new Date(order.orderedAt) > new Date(existing.orderedAt)) {
        map.set(order.packagingId, order);
      }
    }
    return map;
  }, [allOrders]);

  const filtered = useMemo(() => {
    return packaging.filter((p) => {
      if (f.search && !p.name.toLowerCase().includes(f.search.toLowerCase()) && !(p.manufacturer ?? "").toLowerCase().includes(f.search.toLowerCase())) return false;
      if (f.filterStock === "out-of-stock" && !p.outOfStock) return false;
      if (f.filterStock === "low-stock" && (!p.lowStock || p.outOfStock)) return false;
      if (f.filterStock === "ordered" && !p.lowStockOrdered) return false;
      if (f.filterStock === "in-stock" && (p.lowStock || p.outOfStock)) return false;
      if (f.filterCapacity && !matchesCapacity(p.capacity, f.filterCapacity)) return false;
      return true;
    });
  }, [packaging, f.search, f.filterStock, f.filterCapacity]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    const cap = parseInt(newCapacity) || 1;
    const id = await savePackaging({
      name: newName.trim(),
      capacity: cap,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    router.push(`/packaging/${encodeURIComponent(String(id))}?new=1`);
  }

  return (
    <div>
      <PageHeader title="Packaging" description="Boxes, inserts, and other packaging materials" />
      <div className="px-4 space-y-3 pb-6">
        <ListToolbar
          search={f.search}
          onSearchChange={(v) => setF("search", v)}
          searchPlaceholder="Search name or manufacturer…"
          searchAriaLabel="Search packaging"
          onAdd={() => setShowAdd(true)}
          addAriaLabel="Add packaging"
          addTitle="Add packaging (n)"
          showFilters
          filterPanelOpen={f.showFilters}
          onToggleFilters={() => setF("showFilters", !f.showFilters)}
          activeFilterCount={activeFilterCount}
        />

        {f.showFilters && (
          <FilterPanel activeFilterCount={activeFilterCount} onClearAll={clearFilters}>
            <FilterChipGroup
              label="Stock status"
              options={STOCK_OPTIONS}
              value={f.filterStock}
              defaultValue="all"
              onChange={(v) => setF("filterStock", v as StockFilter)}
            />
            <FilterChipGroup
              label="Capacity"
              options={CAPACITY_OPTIONS}
              value={f.filterCapacity}
              defaultValue=""
              onChange={(v) => setF("filterCapacity", v)}
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
              placeholder="Packaging name *"
              required
              autoFocus
              className="input"
            />
            <div>
              <label className="label">Product capacity</label>
              <input
                type="number"
                value={newCapacity}
                onChange={(e) => setNewCapacity(e.target.value)}
                placeholder="e.g. 9"
                min="1"
                step="1"
                className="input"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={!newName.trim()}
                className="btn-primary flex-1 py-2"
              >
                Create Packaging
              </button>
              <button
                type="button"
                onClick={() => { setShowAdd(false); setNewName(""); setNewCapacity(""); }}
                className="btn-secondary px-4 py-2"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {filtered.length === 0 ? (
          <p className="text-muted-foreground text-sm py-8 text-center">
            {packaging.length === 0
              ? "No packaging yet. Tap + to add your first."
              : "No packaging matches your search."}
          </p>
        ) : (
          <div role="table" aria-label="Packaging" className="rounded-lg border border-border bg-card overflow-hidden overflow-x-auto">
            <PantryTableHeader columns={PACKAGING_COLUMNS} gridTemplateColumns={PACKAGING_GRID} hasAction />
            {filtered.map((pkg) => {
              const latestOrder = pkg.id ? latestOrderMap.get(pkg.id) : undefined;
              return (
                <PantryTableRow
                  key={pkg.id}
                  href={`/packaging/${encodeURIComponent(pkg.id ?? "")}`}
                  lowStock={pkg.lowStock}
                  outOfStock={pkg.outOfStock}
                  archived={pkg.archived}
                  gridTemplateColumns={PACKAGING_GRID}
                  action={
                    <LowStockFlagButton
                      flagged={pkg.lowStock}
                      itemName={pkg.name}
                      onFlag={() => setPackagingLowStock(pkg.id!, true)}
                      onUnflag={() => setPackagingLowStock(pkg.id!, false)}
                    />
                  }
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-md bg-muted shrink-0 flex items-center justify-center text-muted-foreground">
                      <Package className="w-4 h-4" />
                    </div>
                    <h3 className="font-medium text-sm truncate">
                      {pkg.name}
                      {pkg.archived && <span className="ml-1.5 text-[10px] font-normal text-muted-foreground align-middle">archived</span>}
                    </h3>
                  </div>
                  <div>
                    {pkg.outOfStock ? (
                      <StockBadge status="out-of-stock" />
                    ) : pkg.lowStock ? (
                      <StockBadge status={pkg.lowStockOrdered ? "ordered" : "low-stock"} />
                    ) : (
                      <span className="text-xs text-muted-foreground">In stock</span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">fits {pkg.capacity}</span>
                  <span className="text-xs text-muted-foreground truncate">{pkg.manufacturer || "—"}</span>
                  <span className="text-xs tabular-nums text-muted-foreground text-right">{latestOrder ? `${sym}${latestOrder.pricePerUnit.toFixed(2)}` : "—"}</span>
                  <span className="text-xs tabular-nums text-muted-foreground text-right">{pkg.updatedAt ? formatDate(pkg.updatedAt) : "—"}</span>
                </PantryTableRow>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
