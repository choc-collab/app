import { ChevronDown } from "lucide-react";
import { GroupStockBadge } from "./stock-badge";

/**
 * Collapsible section header used by all grouped pantry list pages.
 *
 * Renders:
 *  - A chevron that rotates 90° when collapsed
 *  - The group label as an <h2>
 *  - An item count
 *  - Optional stock summary badges (out / low)
 *
 * The collapse state lives in the parent page (a `Set<string>` of collapsed keys).
 *
 * @example
 * <GroupHeader
 *   label={category}
 *   count={items.length}
 *   isCollapsed={collapsedGroups.has(category)}
 *   onToggle={() => toggleGroup(category)}
 *   outCount={items.filter((i) => i.outOfStock).length}
 *   lowCount={items.filter((i) => i.lowStock && !i.outOfStock).length}
 * />
 * {!isCollapsed && <ul>...</ul>}
 */
export function GroupHeader({
  label,
  count,
  isCollapsed,
  onToggle,
  outCount = 0,
  lowCount = 0,
}: {
  label: string;
  count: number;
  isCollapsed: boolean;
  onToggle: () => void;
  outCount?: number;
  lowCount?: number;
}) {
  return (
    <button
      onClick={onToggle}
      aria-expanded={!isCollapsed}
      className="flex items-center gap-2 w-full text-left mb-2"
    >
      <ChevronDown
        aria-hidden="true"
        className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${
          isCollapsed ? "-rotate-90" : ""
        }`}
      />
      <h2 className="text-sm font-semibold text-primary">{label}</h2>
      <span className="text-xs text-muted-foreground">({count})</span>
      <GroupStockBadge outCount={outCount} lowCount={lowCount} />
    </button>
  );
}
