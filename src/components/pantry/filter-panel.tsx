import { X } from "lucide-react";

/**
 * Container for a pantry page's filter section.
 *
 * Renders a card with `children` (your <FilterChipGroup> rows) and a
 * "Clear all filters" button at the bottom when `activeFilterCount > 0`.
 *
 * @example
 * {showFilters && (
 *   <FilterPanel activeFilterCount={activeFilterCount} onClearAll={clearFilters}>
 *     <FilterChipGroup label="Stock status" ... />
 *     <FilterChipGroup label="Type" multi ... />
 *   </FilterPanel>
 * )}
 */
export function FilterPanel({
  children,
  activeFilterCount,
  onClearAll,
}: {
  children: React.ReactNode;
  activeFilterCount: number;
  onClearAll: () => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-3">
      {children}
      {activeFilterCount > 0 && (
        <button
          type="button"
          onClick={onClearAll}
          className="text-xs text-muted-foreground flex items-center gap-1 hover:text-foreground transition-colors"
        >
          <X className="w-3 h-3" />
          Clear all filters
        </button>
      )}
    </div>
  );
}
