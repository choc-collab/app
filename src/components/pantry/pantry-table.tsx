import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Aligned-table row layout for pantry list pages, replacing the old stacked-card
 * list. A page defines its own `gridTemplateColumns` (CSS track sizes, ending in a
 * fixed track for the trailing chevron) and a matching `PantryTableColumn[]` for
 * the header labels — both must stay in sync so header and data cells line up.
 *
 * @example
 * const GRID = "minmax(200px,1.5fr) 100px minmax(140px,1fr) 70px 90px 90px 20px";
 * const COLUMNS: PantryTableColumn[] = [
 *   { key: "name", label: "Filling" },
 *   { key: "status", label: "Status" },
 *   { key: "stock", label: "In stock" },
 *   { key: "usedIn", label: "Used in", align: "right" },
 *   { key: "lastMade", label: "Last made", align: "right" },
 *   { key: "updated", label: "Updated", align: "right" },
 * ];
 * <div role="table" className="rounded-lg border border-border bg-card overflow-hidden">
 *   <PantryTableHeader columns={COLUMNS} gridTemplateColumns={GRID} />
 *   {groups.map((group) => (
 *     <div key={group.key}>
 *       <PantryTableGroupHeader label={group.label} count={group.items.length} … />
 *       {!collapsed && group.items.map((item) => (
 *         <PantryTableRow key={item.id} href={`/fillings/${item.id}`} lowStock={…}>
 *           <span>…</span> …one node per column, same order as COLUMNS…
 *         </PantryTableRow>
 *       ))}
 *     </div>
 *   ))}
 * </div>
 */
export interface PantryTableColumn {
  key: string;
  label: string;
  align?: "left" | "right";
}

export function PantryTableHeader({
  columns,
  gridTemplateColumns,
}: {
  columns: PantryTableColumn[];
  gridTemplateColumns: string;
}) {
  return (
    <div
      role="row"
      className="grid items-center gap-3 px-3 py-2 bg-muted border-b border-border"
      style={{ gridTemplateColumns }}
    >
      {columns.map((col) => (
        <span
          key={col.key}
          role="columnheader"
          className={`text-[10px] font-semibold uppercase tracking-wide text-muted-foreground ${
            col.align === "right" ? "text-right" : "text-left"
          }`}
        >
          {col.label}
        </span>
      ))}
      <span aria-hidden="true" />
    </div>
  );
}

/** Section divider row between groups of rows (one per category). Wraps the
 *  existing `GroupHeader` chevron/label/count so grouping behaviour (collapse
 *  state, out/low summary badges) is unchanged — only the surrounding chrome
 *  is restyled to read as a row inside the table card instead of free text
 *  above an indented list. */
export function PantryTableGroupHeader({ children }: { children: ReactNode }) {
  return <div className="px-3 py-2 bg-muted/50 border-b border-border [&_button]:mb-0">{children}</div>;
}

export function PantryTableRow({
  href,
  gridTemplateColumns,
  lowStock,
  outOfStock,
  archived,
  action,
  children,
}: {
  href: string;
  gridTemplateColumns: string;
  lowStock?: boolean;
  outOfStock?: boolean;
  /** Archived items get a dimmed left edge — purely visual. */
  archived?: boolean;
  /** Optional element rendered after the row, outside the link hitbox (e.g. a
   *  low-stock flag toggle) — mirrors ListItemCard's `action` slot. */
  action?: ReactNode;
  /** One node per data column, in the same order as the page's PantryTableColumn[]. */
  children: ReactNode;
}) {
  const edgeClass = outOfStock
    ? "border-l-status-alert-edge"
    : lowStock
    ? "border-l-status-warn-edge"
    : archived
    ? "border-l-border/50 opacity-60"
    : "border-l-border";

  return (
    <div role="row" className={`border-b border-border last:border-b-0 border-l-2 ${edgeClass}`}>
      <div className="flex items-center min-w-0">
        <Link
          href={href}
          className="grid items-center gap-3 px-3 py-2 hover:bg-muted/60 transition-colors min-w-0 flex-1"
          style={{ gridTemplateColumns }}
        >
          {children}
          <ChevronRight aria-hidden="true" className="w-4 h-4 text-muted-foreground shrink-0 justify-self-end" />
        </Link>
        {action}
      </div>
    </div>
  );
}
