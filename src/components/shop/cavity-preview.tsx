import { derivePackagingGrid, type PackagingGridInput } from "@/lib/cavityGrid";
import type { ShopProductInfo } from "@/lib/shopColor";

/**
 * A small, read-only preview of a box's cavity layout.
 *
 * Each cavity is a square tile; the whole grid sits inside a dark cocoa
 * "divider frame" background, mirroring the handoff design. The cavity
 * contents come from `cells` (row-major productId or null) and the colour
 * comes from `productInfoById` — a view map resolved upstream via
 * `useShopProducts` / `resolveShopColor`.
 *
 * Photos are intentionally not rendered anywhere in the Shop — at these
 * sizes (14–36 px) the colour + name-hash is far more readable.
 */
export interface CavityPreviewProps {
  cells: readonly (string | null)[];
  packaging: PackagingGridInput;
  productInfoById: Map<string, ShopProductInfo>;
  cellSize?: number;
  gap?: number;
  pad?: number;
  className?: string;
}

export function CavityPreview({
  cells,
  packaging,
  productInfoById,
  cellSize = 14,
  gap = 2,
  pad = 4,
  className,
}: CavityPreviewProps) {
  const { rows, cols } = derivePackagingGrid(packaging);
  const total = rows * cols;
  const slots = cells.length >= total ? cells.slice(0, total) : [...cells, ...Array(total - cells.length).fill(null)];

  return (
    <div
      className={className}
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${cols}, ${cellSize}px)`,
        gridAutoRows: `${cellSize}px`,
        gap,
        padding: pad,
        background: "linear-gradient(180deg, #3a2a20 0%, #2a1e16 100%)",
        borderRadius: Math.max(2, Math.round(pad / 2)),
      }}
      aria-label={`Box preview, ${rows}×${cols}`}
    >
      {slots.map((pid, i) => (
        <CavityTile
          key={i}
          info={pid ? productInfoById.get(pid) : undefined}
          cellSize={cellSize}
        />
      ))}
    </div>
  );
}

function CavityTile({
  info,
  cellSize,
}: {
  info: ShopProductInfo | undefined;
  cellSize: number;
}) {
  const baseStyle: React.CSSProperties = {
    width: cellSize,
    height: cellSize,
    borderRadius: Math.max(1, Math.round(cellSize / 7)),
    boxShadow: "inset 0 1px 2px rgba(0,0,0,0.5)",
  };

  if (!info) {
    return (
      <div
        aria-hidden
        style={{ ...baseStyle, background: "rgba(15,10,6,0.55)" }}
      />
    );
  }

  return (
    <div
      aria-label={info.name}
      title={info.name}
      style={{ ...baseStyle, background: info.color }}
    />
  );
}
