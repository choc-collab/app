import { derivePackagingGrid, type PackagingGridInput } from "@/lib/cavityGrid";
import type { ShopProductInfo } from "@/lib/shopColor";
import type { ShopKind } from "@/types";
import { BonbonDisc } from "./bonbon-disc";

/** Square slabs (enrobed) fill the cavity more snugly than round discs;
 *  long bars/snack-bars use the same dominant dimension and rely on the
 *  bonbon's own aspect ratio to keep them inside the cavity. */
function bonbonSizeForCavity(kind: ShopKind, cellSize: number): number {
  return kind === "enrobed" ? Math.round(cellSize * 0.86) : Math.round(cellSize * 0.78);
}

/**
 * The interactive cocoa tray on the Shop fill screen.
 *
 * Each cavity is a button:
 *   - Empty + inactive   → dark well (tap to select)
 *   - Empty + active     → dashed highlight border, mono "TAP" label
 *   - Filled + inactive  → bonbon disc (tap to clear + select)
 *   - Filled + active    → bonbon disc with highlight border
 *
 * The tray itself is the cocoa linear-gradient frame.
 */
export interface SaleCavityTrayProps {
  cells: readonly (string | null)[];
  activeIndex: number | null;
  packaging: PackagingGridInput;
  productInfoById: Map<string, ShopProductInfo>;
  onSelect: (index: number) => void;
  onClear: (index: number) => void;
  cellSize?: number;
  gap?: number;
  pad?: number;
}

export function SaleCavityTray({
  cells,
  activeIndex,
  packaging,
  productInfoById,
  onSelect,
  onClear,
  cellSize = 84,
  gap = 5,
  pad = 16,
}: SaleCavityTrayProps) {
  const { rows, cols } = derivePackagingGrid(packaging);
  const total = rows * cols;
  const slots = cells.length >= total ? cells.slice(0, total) : [...cells, ...Array(total - cells.length).fill(null)];

  return (
    <div
      role="group"
      aria-label={`Box cavities ${rows} by ${cols}`}
      style={{
        display: "inline-grid",
        gridTemplateColumns: `repeat(${cols}, ${cellSize}px)`,
        gridAutoRows: `${cellSize}px`,
        gap,
        padding: pad,
        // Milk-chocolate frame — lighter than the handoff's near-black so it
        // reads as a card-stock bonbon box rather than a presentation case.
        background: "linear-gradient(180deg, #6b4a30 0%, #4a3324 100%)",
        borderRadius: 8,
        boxShadow:
          "0 6px 22px rgba(74,51,36,0.28), inset 0 1px 0 rgba(255,255,255,0.06)",
      }}
    >
      {slots.map((pid, i) => {
        const info = pid ? productInfoById.get(pid) : undefined;
        return (
          <SquareCavity
            key={i}
            index={i}
            info={info}
            active={i === activeIndex}
            cellSize={cellSize}
            onSelect={onSelect}
            onClear={onClear}
            filled={pid != null}
          />
        );
      })}
    </div>
  );
}

function SquareCavity({
  index,
  info,
  active,
  cellSize,
  onSelect,
  onClear,
  filled,
}: {
  index: number;
  info: ShopProductInfo | undefined;
  active: boolean;
  cellSize: number;
  onSelect: (i: number) => void;
  onClear: (i: number) => void;
  filled: boolean;
}) {
  const label = info
    ? `Cavity ${index + 1}: ${info.name} — tap to clear`
    : active
      ? `Cavity ${index + 1}: active, tap a bonbon to place`
      : `Cavity ${index + 1}: empty, tap to select`;

  return (
    <button
      type="button"
      onClick={() => (filled ? onClear(index) : onSelect(index))}
      aria-label={label}
      aria-pressed={active}
      data-testid={`shop-cavity-${index}`}
      data-filled={filled ? "true" : "false"}
      data-active={active ? "true" : "false"}
      style={{
        width: cellSize,
        height: cellSize,
        padding: 0,
        background: "rgba(15,10,6,0.55)",
        border: active
          ? "2px dashed #e0cdba"
          : "1px solid rgba(15,10,6,0.85)",
        borderRadius: 3,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "inset 0 2px 5px rgba(0,0,0,0.55)",
        transition: "border-color 150ms",
      }}
    >
      {info ? (
        <BonbonDisc info={info} size={bonbonSizeForCavity(info.kind, cellSize)} ariaHidden />
      ) : active ? (
        <span
          style={{
            color: "#e0cdba",
            fontFamily: "var(--font-mono, ui-monospace, monospace)",
            fontSize: 10,
            letterSpacing: "0.08em",
          }}
        >
          TAP
        </span>
      ) : null}
    </button>
  );
}
