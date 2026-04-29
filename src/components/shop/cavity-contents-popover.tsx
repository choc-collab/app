"use client";

import { BonbonDisc } from "./bonbon-disc";
import { usedCounts } from "@/lib/saleDraft";
import type { ShopProductInfo } from "@/lib/shopColor";

/**
 * Hover + focus popover that lists the unique bonbons in a box with their
 * counts. Wraps any trigger element (typically the mini `CavityPreview` on
 * the Shop landing rows).
 *
 *   <CavityContentsPopover cells={sale.cells} productInfoById={productInfoById}>
 *     <CavityPreview ... />
 *   </CavityContentsPopover>
 *
 * The popover is always in the DOM but hidden via opacity; pointer-events
 * are blocked so hover targets underneath still work. Keyboard users reach
 * it via Tab (the wrapper exposes tabIndex=0 + aria-label). Touch users on
 * iPad can tap-and-hold to see the native tooltip fallback (`title` attr).
 */
export interface CavityContentsPopoverProps {
  cells: readonly (string | null)[];
  productInfoById: Map<string, ShopProductInfo>;
  children: React.ReactNode;
  placement?: "bottom" | "top";
}

export function CavityContentsPopover({
  cells,
  productInfoById,
  children,
  placement = "bottom",
}: CavityContentsPopoverProps) {
  const counts = usedCounts(cells);
  const entries = Array.from(counts.entries())
    .map(([pid, n]) => ({ pid, info: productInfoById.get(pid), n }))
    .filter((e) => e.info)
    .sort((a, b) => a.info!.name.localeCompare(b.info!.name));

  const summary = entries.length === 0
    ? "Empty box"
    : entries.map((e) => `${e.info!.name} ×${e.n}`).join(", ");

  return (
    <div
      className="relative group"
      tabIndex={0}
      aria-label={`Contents: ${summary}`}
      title={summary}
      data-testid="shop-contents-trigger"
    >
      {children}
      {entries.length > 0 && (
        <div
          role="tooltip"
          className={`absolute left-0 z-20 w-max max-w-[14rem] rounded-md border border-border bg-card shadow-lg px-2.5 py-2 opacity-0 pointer-events-none transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 ${
            placement === "top" ? "bottom-full mb-1.5" : "top-full mt-1.5"
          }`}
          data-testid="shop-contents-popover"
        >
          <ul className="flex flex-col gap-1.5">
            {entries.map((e) => (
              <li key={e.pid} className="flex items-center gap-1.5 text-xs leading-tight">
                <BonbonDisc info={e.info!} size={16} ariaHidden />
                <span className="flex-1 truncate">{e.info!.name}</span>
                <span className="font-mono text-muted-foreground">×{e.n}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
