/**
 * Pantry shared components
 * ========================
 * Every pantry list page (Ingredients, Fillings, Products, Moulds, Packaging,
 * Collections, Decoration) is built from these primitives. Import from here,
 * not from individual files, so consumers don't need to know the file layout.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  ADDING A NEW PANTRY LIST PAGE?  Use this checklist:                     │
 * │                                                                          │
 * │  1. <PageHeader title="…" description="…" />   (src/components)         │
 * │  2. <ListToolbar … />                           (search + filter + add)  │
 * │  3. useNShortcut(() => setShowAdd(true), showAdd)  (src/lib)             │
 * │  4. {showFilters && <FilterPanel …>}            (optional)               │
 * │       └─ <FilterChipGroup … />  for each filter dimension               │
 * │       └─ <MultiSelectDropdown … /> for large option sets                │
 * │  5. {showAdd && <QuickAddForm …>}               (inline create form)     │
 * │  6. <EmptyState … />                            (no data / no results)   │
 * │  7. For grouped pages:                                                   │
 * │       <CollapseControls … />                    (top of list)            │
 * │       <GroupHeader … />                         (per group)              │
 * │       <ul className="space-y-2 ml-6">                                   │
 * │         <ListItemCard href={…} … />             (per item)               │
 * │       </ul>                                                              │
 * │  8. For flat pages: just <ul> + <ListItemCard> without grouping          │
 * │                                                                          │
 * │  See src/app/pantry/decoration/page.tsx for a fully worked example.      │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

export { ListToolbar } from "./list-toolbar";
export { FilterPanel } from "./filter-panel";
export { FilterChipGroup } from "./filter-chips";
export { QuickAddForm } from "./quick-add-form";
export { EmptyState } from "./empty-state";
export { GroupHeader } from "./group-header";
export { StockBadge, GroupStockBadge } from "./stock-badge";
export type { StockStatus } from "./stock-badge";
export { ListItemCard } from "./list-item-card";
export { CollapseControls } from "./collapse-controls";
export { MultiSelectDropdown } from "./multi-select-dropdown";
export { UsedInPanel } from "./used-in-panel";
export type { UsedInItem } from "./used-in-panel";
export { LowStockFlagButton } from "./low-stock-flag-button";
export { ArchiveFilterChip } from "./archive-filter-chip";
