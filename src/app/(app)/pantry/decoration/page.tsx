"use client";

/**
 * Decoration page — three tabs: Materials, Categories, Designs
 * ─────────────────────────────────────────────────────────────
 * Materials: existing decoration material list (cocoa butters, lustre dusts, etc.)
 * Categories: configurable material types (was hardcoded DECORATION_MATERIAL_TYPES)
 * Designs: configurable shell design techniques (was hardcoded SHELL_TECHNIQUES)
 */

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  useDecorationMaterials, saveDecorationMaterial, setDecorationMaterialLowStock,
  useDecorationMaterialUsageCounts,
  useDecorationCategories, useDecorationCategoryUsageCounts, saveDecorationCategory,
  useShellDesigns, saveShellDesign, useShellDesignUsage,
} from "@/lib/hooks";
import { usePersistedFilters } from "@/lib/use-persisted-filters";
import { PageHeader } from "@/components/page-header";
import { useNShortcut } from "@/lib/use-n-shortcut";
import {
  ListToolbar,
  FilterPanel,
  FilterChipGroup,
  ArchiveFilterChip,
  QuickAddForm,
  EmptyState,
  GroupHeader,
  StockBadge,
  ListItemCard,
  LowStockFlagButton,
} from "@/components/pantry";
import { DECORATION_APPLY_AT_OPTIONS, normalizeApplyAt } from "@/types";
import type { ShellDesignApplyAt } from "@/types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Deterministically maps a name string to a hex colour via a simple hash → hue. */
function nameToColor(name: string): string {
  if (!name.trim()) return "#d4a017";
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
    hash |= 0;
  }
  const hue = Math.abs(hash) % 360;
  const h = hue / 360, s = 0.65, l = 0.55;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue2rgb = (t: number) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const toHex = (x: number) => Math.round(x * 255).toString(16).padStart(2, "0");
  return `#${toHex(hue2rgb(h + 1 / 3))}${toHex(hue2rgb(h))}${toHex(hue2rgb(h - 1 / 3))}`;
}

// ─── Types ───────────────────────────────────────────────────────────────────

type DecorationTab = "materials" | "categories" | "designs";
type StockFilter = "all" | "in-stock" | "low-stock" | "out-of-stock" | "ordered";

const TABS: { id: DecorationTab; label: string }[] = [
  { id: "materials", label: "Materials" },
  { id: "categories", label: "Categories" },
  { id: "designs", label: "Designs" },
];

const STOCK_OPTIONS: { value: StockFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "in-stock", label: "In stock" },
  { value: "low-stock", label: "Low stock" },
  { value: "out-of-stock", label: "Out of stock" },
  { value: "ordered", label: "Ordered" },
];

const APPLY_AT_LABELS = new Map(DECORATION_APPLY_AT_OPTIONS.map((o) => [o.value, o.label]));

// ─── Page ────────────────────────────────────────────────────────────────────

export default function DecorationPage() {
  const router = useRouter();

  // Tab state (persisted in session so it survives detail→back navigation)
  const [tab, setTab] = usePersistedFilters("decoration-tab", {
    activeTab: "materials" as DecorationTab,
  });
  const activeTab = tab.activeTab;

  return (
    <div>
      <PageHeader
        title="Decoration"
        description="Manage your decoration materials, material categories, and shell design techniques"
      />

      {/* Tab bar */}
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

      {activeTab === "materials" && <MaterialsTab />}
      {activeTab === "categories" && <CategoriesTab />}
      {activeTab === "designs" && <DesignsTab />}
    </div>
  );
}

// ─── Materials Tab ───────────────────────────────────────────────────────────

function MaterialsTab() {
  const router = useRouter();

  const [f, setF] = usePersistedFilters("decoration", {
    search: "",
    showFilters: false,
    filterTypes: [] as string[],
    filterStock: "all" as StockFilter,
    showArchived: false,
  });
  const filterTypesSet = useMemo(() => new Set(f.filterTypes), [f.filterTypes]);

  const materials = useDecorationMaterials(f.showArchived);
  const categories = useDecorationCategories();
  const usageCounts = useDecorationMaterialUsageCounts();
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // Build category options from DB
  const categoryOptions = useMemo(() =>
    categories.map((c) => ({ value: c.slug, label: c.name })),
    [categories],
  );
  const categoryLabelMap = useMemo(() =>
    new Map(categories.map((c) => [c.slug, c.name])),
    [categories],
  );

  // Add form
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("");

  // Default the type to first category when categories load
  const defaultType = categories.length > 0 ? categories[0].slug : "cocoa_butter";

  useNShortcut(() => setShowAdd(true), showAdd);

  const activeFilterCount =
    (filterTypesSet.size > 0 ? 1 : 0) +
    (f.filterStock !== "all" ? 1 : 0) +
    (f.showArchived ? 1 : 0);

  const filtered = useMemo(() => {
    return materials.filter((m) => {
      if (f.search && !m.name.toLowerCase().includes(f.search.toLowerCase()) && !(m.manufacturer ?? "").toLowerCase().includes(f.search.toLowerCase())) return false;
      if (filterTypesSet.size > 0 && !filterTypesSet.has(m.type)) return false;
      if (f.filterStock === "out-of-stock" && !m.outOfStock) return false;
      else if (f.filterStock === "low-stock" && (!m.lowStock || m.outOfStock)) return false;
      else if (f.filterStock === "ordered" && !m.lowStockOrdered) return false;
      else if (f.filterStock === "in-stock" && (m.lowStock || m.outOfStock)) return false;
      return true;
    });
  }, [materials, f.search, filterTypesSet, f.filterStock]);

  // Group by category slug, using DB-driven category order
  const grouped = useMemo(() => {
    const slugOrder = categories.map((c) => c.slug);
    // Include any slugs from materials that aren't in the category list (legacy data)
    const allSlugs = new Set(slugOrder);
    for (const m of filtered) {
      if (!allSlugs.has(m.type)) {
        slugOrder.push(m.type);
        allSlugs.add(m.type);
      }
    }
    return slugOrder
      .map((slug) => ({
        type: slug,
        label: categoryLabelMap.get(slug) ?? slug,
        items: filtered.filter((m) => m.type === slug),
      }))
      .filter(({ items }) => items.length > 0);
  }, [filtered, categories, categoryLabelMap]);

  function toggleGroup(type: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type); else next.add(type);
      return next;
    });
  }

  function clearFilters() {
    setF("filterTypes", []);
    setF("filterStock", "all");
    setF("showArchived", false);
  }

  async function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!newName.trim()) return;
    const id = await saveDecorationMaterial({
      name: newName.trim(),
      type: (newType || defaultType) as never,
      color: nameToColor(newName.trim()),
    });
    setNewName("");
    setNewType("");
    setShowAdd(false);
    router.push(`/pantry/decoration/${encodeURIComponent(id)}?new=1`);
  }

  return (
    <div className="px-4 space-y-3 pb-6">
      <ListToolbar
        search={f.search}
        onSearchChange={(v) => setF("search", v)}
        searchPlaceholder="Search name or manufacturer…"
        searchAriaLabel="Search decoration materials"
        onAdd={() => setShowAdd(true)}
        addAriaLabel="Add decoration material"
        addTitle="Add material (n)"
        showFilters
        filterPanelOpen={f.showFilters}
        onToggleFilters={() => setF("showFilters", !f.showFilters)}
        activeFilterCount={activeFilterCount}
      />

      {f.showFilters && (
        <FilterPanel activeFilterCount={activeFilterCount} onClearAll={clearFilters}>
          <FilterChipGroup
            label="Type"
            options={categoryOptions}
            multi
            selected={filterTypesSet}
            onToggle={(t) => {
              const next = new Set(filterTypesSet);
              if (next.has(t)) next.delete(t); else next.add(t);
              setF("filterTypes", Array.from(next));
            }}
          />
          <FilterChipGroup
            label="Stock status"
            options={STOCK_OPTIONS}
            value={f.filterStock}
            defaultValue="all"
            onChange={(v) => setF("filterStock", v as StockFilter)}
          />
          <ArchiveFilterChip
            value={f.showArchived}
            onChange={(v) => setF("showArchived", v)}
          />
        </FilterPanel>
      )}

      {showAdd && (
        <QuickAddForm
          onSubmit={handleAdd}
          onCancel={() => { setShowAdd(false); setNewName(""); setNewType(""); }}
          submitLabel="Create Material"
          canSubmit={!!newName.trim()}
        >
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") { setShowAdd(false); setNewName(""); setNewType(""); } }}
            placeholder="Material name…"
            aria-label="Material name"
            className="input w-full"
            autoFocus
            required
          />
          <select
            value={newType || defaultType}
            onChange={(e) => setNewType(e.target.value)}
            className="input w-full"
          >
            {categories.map((c) => (
              <option key={c.slug} value={c.slug}>{c.name}</option>
            ))}
          </select>
        </QuickAddForm>
      )}

      {filtered.length === 0 && (
        <EmptyState
          hasData={materials.length > 0}
          emptyMessage="No decoration materials yet. Tap + to add your first."
          filteredMessage="No materials match your filters."
        />
      )}

      {filtered.length > 0 && (
        <div className="space-y-4">
          {grouped.map(({ type, label, items }) => {
            const isCollapsed = !f.search && activeFilterCount === 0 && collapsedGroups.has(type);
            return (
              <div key={type}>
                <GroupHeader
                  label={label}
                  count={items.length}
                  isCollapsed={isCollapsed}
                  onToggle={() => toggleGroup(type)}
                  outCount={items.filter((m) => m.outOfStock).length}
                  lowCount={items.filter((m) => m.lowStock && !m.outOfStock).length}
                />
                {!isCollapsed && (
                  <ul className="space-y-2 ml-6">
                    {items.map((m) => {
                      const usage = usageCounts.get(m.id!) ?? 0;
                      return (
                        <ListItemCard
                          key={m.id}
                          href={`/pantry/decoration/${encodeURIComponent(m.id!)}`}
                          outOfStock={m.outOfStock}
                          lowStock={m.lowStock}
                          archived={m.archived}
                          action={
                            <LowStockFlagButton
                              flagged={m.lowStock}
                              itemName={m.name}
                              onFlag={() => setDecorationMaterialLowStock(m.id!, true)}
                              onUnflag={() => setDecorationMaterialLowStock(m.id!, false)}
                            />
                          }
                        >
                          <span
                            aria-hidden="true"
                            className="w-9 h-9 rounded-md border border-black/10 shadow-inner shrink-0"
                            style={{ backgroundColor: m.color ?? "#9ca3af" }}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-medium text-sm truncate">{m.name}</span>
                              {m.archived && (
                                <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">Archived</span>
                              )}
                              {!m.archived && m.outOfStock && <StockBadge status="out-of-stock" />}
                              {!m.archived && !m.outOfStock && m.lowStock && (
                                <StockBadge status={m.lowStockOrdered ? "ordered" : "low-stock"} />
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              {m.manufacturer && <span className="truncate">{m.manufacturer}</span>}
                              {m.manufacturer && <span aria-hidden="true">·</span>}
                              <span className="shrink-0">
                                {usage === 0 ? "Not used yet" : `Used in ${usage} product${usage === 1 ? "" : "s"}`}
                              </span>
                            </div>
                          </div>
                        </ListItemCard>
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

// ─── Categories Tab ──────────────────────────────────────────────────────────

function CategoriesTab() {
  const router = useRouter();

  const [f, setF] = usePersistedFilters("decoration-categories", {
    search: "",
    showFilters: false,
    showArchived: false,
  });

  const categories = useDecorationCategories(f.showArchived);
  const usageCounts = useDecorationCategoryUsageCounts();

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
    // Generate slug from name: lowercase, spaces → underscores, strip non-alphanum
    const slug = newName.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
    const id = await saveDecorationCategory({
      name: newName.trim(),
      slug,
    });
    setNewName("");
    setShowAdd(false);
    router.push(`/pantry/decoration/categories/${encodeURIComponent(id)}?new=1`);
  }

  return (
    <div className="px-4 space-y-3 pb-6">
      <ListToolbar
        search={f.search}
        onSearchChange={(v) => setF("search", v)}
        searchPlaceholder="Search categories…"
        searchAriaLabel="Search decoration categories"
        onAdd={() => setShowAdd(true)}
        addAriaLabel="Add decoration category"
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
            placeholder="Category name (e.g. Metallic Pigments)…"
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
          emptyMessage="No decoration categories yet. Tap + to add your first."
          filteredMessage="No categories match your search."
        />
      )}

      {filtered.length > 0 && (
        <ul className="space-y-2">
          {filtered.map((c) => {
            const usage = usageCounts.get(c.slug) ?? 0;
            return (
              <ListItemCard
                key={c.id}
                href={`/pantry/decoration/categories/${encodeURIComponent(c.id!)}`}
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
                    {usage === 0 ? "No materials" : `${usage} material${usage === 1 ? "" : "s"}`}
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

// ─── Designs Tab ─────────────────────────────────────────────────────────────

function DesignsTab() {
  const router = useRouter();

  const [f, setF] = usePersistedFilters("decoration-designs", {
    search: "",
    showFilters: false,
    showArchived: false,
  });

  const designs = useShellDesigns(f.showArchived);

  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newApplyAt, setNewApplyAt] = useState<ShellDesignApplyAt>("colour");

  useNShortcut(() => setShowAdd(true), showAdd);

  const activeFilterCount = (f.showArchived ? 1 : 0);

  const filtered = useMemo(() => {
    return designs.filter((d) => {
      if (f.search && !d.name.toLowerCase().includes(f.search.toLowerCase())) return false;
      return true;
    });
  }, [designs, f.search]);

  function clearFilters() {
    setF("showArchived", false);
  }

  async function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!newName.trim()) return;
    const id = await saveShellDesign({
      name: newName.trim(),
      defaultApplyAt: newApplyAt,
    });
    setNewName("");
    setNewApplyAt("on_mould");
    setShowAdd(false);
    router.push(`/pantry/decoration/designs/${encodeURIComponent(id)}?new=1`);
  }

  return (
    <div className="px-4 space-y-3 pb-6">
      <ListToolbar
        search={f.search}
        onSearchChange={(v) => setF("search", v)}
        searchPlaceholder="Search designs…"
        searchAriaLabel="Search shell designs"
        onAdd={() => setShowAdd(true)}
        addAriaLabel="Add shell design"
        addTitle="Add design (n)"
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
          onCancel={() => { setShowAdd(false); setNewName(""); setNewApplyAt("colour"); }}
          submitLabel="Create Design"
          canSubmit={!!newName.trim()}
        >
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") { setShowAdd(false); setNewName(""); setNewApplyAt("colour"); } }}
            placeholder="Design name (e.g. Marble Swirl)…"
            aria-label="Design name"
            className="input w-full"
            autoFocus
            required
          />
          <select
            value={newApplyAt}
            onChange={(e) => setNewApplyAt(e.target.value as ShellDesignApplyAt)}
            className="input w-full"
            aria-label="Production step"
          >
            {DECORATION_APPLY_AT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </QuickAddForm>
      )}

      {filtered.length === 0 && (
        <EmptyState
          hasData={designs.length > 0}
          emptyMessage="No shell designs yet. Tap + to add your first."
          filteredMessage="No designs match your search."
        />
      )}

      {filtered.length > 0 && (
        <ul className="space-y-2">
          {filtered.map((d) => (
            <ListItemCard
              key={d.id}
              href={`/pantry/decoration/designs/${encodeURIComponent(d.id!)}`}
              archived={d.archived}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm truncate">{d.name}</span>
                  {d.archived && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">Archived</span>
                  )}
                  <span className="text-[11px] text-muted-foreground bg-muted/60 rounded px-1.5 py-0.5 shrink-0">
                    {APPLY_AT_LABELS.get(normalizeApplyAt(d.defaultApplyAt)) ?? "Colour"}
                  </span>
                </div>
              </div>
            </ListItemCard>
          ))}
        </ul>
      )}
    </div>
  );
}
