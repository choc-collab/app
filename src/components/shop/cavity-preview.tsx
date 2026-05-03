import { derivePackagingGrid, type PackagingGridInput } from "@/lib/cavityGrid";
import type { ShopProductInfo } from "@/lib/shopColor";
import { BonbonDisc } from "./bonbon-disc";

/**
 * A small, read-only preview of a packaging's contents.
 *
 * Multi-cavity packaging (gift box, snack-bar pack) renders as a divider-frame
 * grid with one tile per cavity. Single-piece packaging (bar wrappers) renders
 * the product visual directly without a frame — a single bar inside a tiny
 * dark frame reads as a confusing "boxed bar" rather than a chocolate bar.
 *
 * The cavity contents come from `cells` (row-major productId or null) and the
 * colour comes from `productInfoById` — a view map resolved upstream via
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

// Lighter milk-chocolate brown for the divider frame. The handoff used a
// near-black cocoa; this reads more like a real bonbon box card.
const FRAME_GRADIENT = "linear-gradient(180deg, #6b4a30 0%, #4a3324 100%)";

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

  // Single-piece packaging (bar wrappers and any other capacity-1 row): drop
  // the frame and render the product visual on its own using the full
  // BonbonDisc, so bars/snack-bars get the same embossed segmented look as
  // their give-away tiles. Footprint roughly matches the framed version
  // (cell + padding) so list layouts don't shift.
  if (total === 1) {
    const slot = slots[0];
    const info = slot ? productInfoById.get(slot) : undefined;
    const visualSize = Math.max(cellSize, Math.round((cellSize + pad * 2) * 1.4));
    return (
      <div
        className={className}
        style={{
          width: visualSize + pad,
          height: visualSize + pad,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
        aria-label={info ? info.name : "Single-piece packaging preview"}
      >
        <BonbonDisc info={info} size={visualSize} ariaHidden />
      </div>
    );
  }

  // Snack-bar pack: vertical stack of slim snack-bar slots, no cocoa frame —
  // the actual physical packaging is a kraft sleeve, not a moulded gift box.
  // Mirrors the design handoff's `SnackPack` visualization.
  if (packaging.productKind === "snack-bar") {
    const slimW = Math.round(cellSize * 3.2);
    const slimH = Math.round(slimW * 0.22);
    return (
      <div
        className={className}
        style={{
          display: "inline-flex",
          flexDirection: "column",
          gap: 2,
          padding: pad,
          background: "linear-gradient(180deg, #efe2c8 0%, #e2d2b2 100%)",
          borderRadius: Math.max(2, Math.round(pad / 2)),
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.45), inset 0 -1px 0 rgba(74,51,36,0.10)",
        }}
        aria-label={`Snack pack with ${slots.length} slots`}
      >
        {slots.map((pid, i) => {
          const info = pid ? productInfoById.get(pid) : undefined;
          if (info) {
            return <BonbonDisc key={i} info={info} size={slimW} ariaHidden />;
          }
          return (
            <div
              key={i}
              aria-hidden
              style={{
                width: slimW,
                height: slimH,
                borderRadius: Math.max(1, Math.round(slimW / 30)),
                background: "rgba(74,51,36,0.10)",
                border: "1px dashed rgba(74,51,36,0.25)",
                boxSizing: "border-box",
              }}
            />
          );
        })}
      </div>
    );
  }

  return (
    <div
      className={className}
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${cols}, ${cellSize}px)`,
        gridAutoRows: `${cellSize}px`,
        gap,
        padding: pad,
        background: FRAME_GRADIENT,
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
  // Empty wells stay square — they represent the cavity itself, not a bonbon.
  if (!info) {
    return (
      <div
        aria-hidden
        style={{
          width: cellSize,
          height: cellSize,
          borderRadius: Math.max(1, Math.round(cellSize / 7)),
          background: "rgba(15,10,6,0.55)",
          boxShadow: "inset 0 1px 2px rgba(0,0,0,0.5)",
        }}
      />
    );
  }
  return <CavityTileVisual info={info} cellSize={cellSize} />;
}

function CavityTileVisual({
  info,
  cellSize,
}: {
  info: ShopProductInfo;
  cellSize: number;
}) {
  // The cavity is `cellSize × cellSize`. The bonbon shape inside follows the
  // same kind-aware aspect ratio used by `BonbonDisc`, so a row of mixed
  // bonbons reads at a glance even at 14 px.
  const shape = miniShapeFor(info.kind, cellSize);
  return (
    <div
      aria-label={info.name}
      title={info.name}
      data-shop-kind={info.kind}
      style={{
        width: cellSize,
        height: cellSize,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          width: shape.width,
          height: shape.height,
          borderRadius: shape.borderRadius,
          background: info.color,
          boxShadow: "inset 0 1px 1px rgba(255,255,255,0.18), inset 0 -1px 1px rgba(0,0,0,0.25)",
        }}
      />
    </div>
  );
}

function miniShapeFor(kind: ShopProductInfo["kind"], cellSize: number): {
  width: number;
  height: number;
  borderRadius: number | string;
} {
  switch (kind) {
    case "enrobed":
      return {
        width: cellSize,
        height: Math.max(1, Math.round(cellSize * 0.92)),
        borderRadius: Math.max(1, Math.round(cellSize / 7)),
      };
    case "bar":
      return {
        // Chunky chocolate-bar tablet — aspect matches the full BonbonDisc
        // (~5:3 grid renders as 2:1 visual).
        width: cellSize,
        height: Math.max(3, Math.round(cellSize * 0.48)),
        borderRadius: Math.max(1, Math.round(cellSize / 7)),
      };
    case "snack-bar":
      return {
        // Slim single-portion stick — much narrower than a tablet,
        // matching the handoff's 4×1 strip proportion.
        width: cellSize,
        height: Math.max(2, Math.round(cellSize * 0.22)),
        borderRadius: Math.max(1, Math.round(cellSize / 8)),
      };
    case "moulded":
    default:
      return {
        width: cellSize,
        height: cellSize,
        borderRadius: "50%",
      };
  }
}
