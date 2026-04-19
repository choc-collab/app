import { ChevronRight } from "lucide-react";
import Link from "next/link";

/**
 * Standard list-row card for every pantry list page.
 *
 * Renders a <li> with:
 *  - Border colour driven by stock status (alert / warn / default)
 *  - A Next.js <Link> that fills the row, ending with a ChevronRight
 *  - An optional `action` slot on the right (e.g. a ShoppingCart toggle button)
 *
 * @example
 * <ListItemCard
 *   href={`/ingredients/${encodeURIComponent(ing.id)}`}
 *   outOfStock={ing.outOfStock}
 *   lowStock={ing.lowStock}
 *   archived={ing.archived}
 *   action={<ShoppingCartToggle ... />}
 * >
 *   <span className="font-medium text-sm">{ing.name}</span>
 * </ListItemCard>
 */
export function ListItemCard({
  href,
  lowStock,
  outOfStock,
  archived,
  children,
  action,
}: {
  href: string;
  lowStock?: boolean;
  outOfStock?: boolean;
  /** Archived items get a dimmed border — purely visual. */
  archived?: boolean;
  /** Content rendered inside the link area (between left edge and chevron). */
  children: React.ReactNode;
  /** Optional element rendered to the right of the link, outside the link hitbox. */
  action?: React.ReactNode;
}) {
  const borderClass = outOfStock
    ? "border-status-alert-edge"
    : lowStock
    ? "border-status-warn-edge"
    : archived
    ? "border-border/50 opacity-60"
    : "border-border";

  return (
    <li
      className={`rounded-lg border bg-card ${borderClass}`}
      style={{ contentVisibility: "auto", containIntrinsicSize: "0 56px" }}
    >
      <div className="flex items-center min-w-0">
        <Link href={href} className="flex items-center gap-3 p-3 min-w-0 flex-1">
          {children}
          <ChevronRight aria-hidden="true" className="w-4 h-4 text-muted-foreground shrink-0" />
        </Link>
        {action}
      </div>
    </li>
  );
}
