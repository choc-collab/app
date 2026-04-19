"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { useCollections, saveCollection } from "@/lib/hooks";
import { ChevronRight } from "lucide-react";
import { ListToolbar, FilterPanel, FilterChipGroup } from "@/components/pantry";
import Link from "next/link";
import type { Collection } from "@/types";
import { useNShortcut } from "@/lib/use-n-shortcut";
import { usePersistedFilters } from "@/lib/use-persisted-filters";

type CollectionStatus = "active" | "upcoming" | "past" | "permanent";

function getStatus(c: Collection): CollectionStatus {
  const today = new Date().toISOString().split("T")[0];
  if (!c.endDate) return c.startDate <= today ? "permanent" : "upcoming";
  if (c.startDate > today) return "upcoming";
  if (c.endDate < today) return "past";
  return "active";
}

const STATUS_LABEL: Record<CollectionStatus, string> = {
  permanent: "standard",
  active: "active",
  upcoming: "upcoming",
  past: "past",
};

const STATUS_CLASS: Record<CollectionStatus, string> = {
  permanent: "text-primary bg-primary/10",
  active: "text-emerald-700 bg-emerald-50",
  upcoming: "text-status-warn bg-status-warn-bg",
  past: "text-muted-foreground bg-muted",
};

const STATUS_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "permanent", label: "Standard" },
  { value: "upcoming", label: "Upcoming" },
  { value: "past", label: "Past" },
];

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export default function CollectionsPage() {
  const router = useRouter();
  const collections = useCollections();
  const [f, setF] = usePersistedFilters("collections", {
    search: "",
    showFilters: false,
    filterStatuses: [] as string[],
  });
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newStart, setNewStart] = useState(() => new Date().toISOString().split("T")[0]);

  useNShortcut(() => setShowAdd(true), showAdd);

  const filterStatusesSet = useMemo(() => new Set(f.filterStatuses), [f.filterStatuses]);

  const activeFilterCount = filterStatusesSet.size > 0 ? 1 : 0;

  function clearFilters() {
    setF("filterStatuses", []);
  }

  function toggleFilterStatus(status: string) {
    const next = new Set(filterStatusesSet);
    if (next.has(status)) next.delete(status); else next.add(status);
    setF("filterStatuses", Array.from(next));
  }

  const filtered = useMemo(() => {
    return collections.filter((c) => {
      if (f.search && !c.name.toLowerCase().includes(f.search.toLowerCase())) return false;
      if (filterStatusesSet.size > 0 && !filterStatusesSet.has(getStatus(c))) return false;
      return true;
    });
  }, [collections, f.search, filterStatusesSet]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    const id = await saveCollection({
      name: newName.trim(),
      startDate: newStart,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    router.push(`/collections/${encodeURIComponent(String(id))}?new=1`);
  }

  return (
    <div>
      <PageHeader title="Collections" description="Seasonal and standard product assortments" />
      <div className="px-4 space-y-3 pb-6">
        <ListToolbar
          search={f.search}
          onSearchChange={(v) => setF("search", v)}
          searchPlaceholder="Search collections…"
          searchAriaLabel="Search collections"
          onAdd={() => setShowAdd(true)}
          addAriaLabel="Add collection"
          addTitle="New collection (n)"
          showFilters
          filterPanelOpen={f.showFilters}
          onToggleFilters={() => setF("showFilters", !f.showFilters)}
          activeFilterCount={activeFilterCount}
        />

        {f.showFilters && (
          <FilterPanel activeFilterCount={activeFilterCount} onClearAll={clearFilters}>
            <FilterChipGroup
              label="Status"
              options={STATUS_FILTER_OPTIONS}
              multi
              selected={filterStatusesSet}
              onToggle={toggleFilterStatus}
            />
          </FilterPanel>
        )}

        {showAdd && (
          <form onSubmit={handleAdd} className="rounded-lg border border-border bg-card p-3 space-y-2">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Collection name *"
              required
              autoFocus
              className="input"
            />
            <div>
              <label className="label">Start date</label>
              <input
                type="date"
                value={newStart}
                onChange={(e) => setNewStart(e.target.value)}
                required
                className="input"
              />
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={!newName.trim()} className="btn-primary flex-1 py-2">
                Create Collection
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
            {collections.length === 0
              ? "No collections yet. Tap + to create your first."
              : "No collections match your search."}
          </p>
        ) : (
          <ul className="space-y-2">
            {filtered.map((c) => {
              const status = getStatus(c);
              return (
                <li key={c.id} className="rounded-lg border border-border bg-card">
                  <Link
                    href={`/collections/${encodeURIComponent(c.id ?? "")}`}
                    className="flex items-center gap-3 p-3 min-w-0"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-medium text-sm truncate">{c.name}</h3>
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${STATUS_CLASS[status]}`}>
                          {STATUS_LABEL[status]}
                        </span>
                      </div>
                      {c.description && (
                        <p className="text-xs text-muted-foreground truncate mt-0.5">{c.description}</p>
                      )}
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-xs text-muted-foreground">
                          From {formatDate(c.startDate)}
                        </span>
                        {c.endDate && (
                          <>
                            <span className="text-muted-foreground/40 text-xs">→</span>
                            <span className="text-xs text-muted-foreground">{formatDate(c.endDate)}</span>
                          </>
                        )}
                        {!c.endDate && status !== "upcoming" && (
                          <span className="text-xs text-muted-foreground/60">· ongoing</span>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
