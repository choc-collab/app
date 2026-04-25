import type { ShopProductInfo } from "@/lib/shopColor";
import { hashedFallbackColor } from "@/lib/shopColor";

/**
 * The Shop's product visual. Renders one of four shapes based on
 * `info.kind`:
 *   - "moulded"   → glossy round disc (polycarb-mould bonbon)
 *   - "enrobed"   → square slab with matte finish (slab cut + dipped)
 *   - "bar"       → embossed segmented tablet (whole chocolate bar, top-down)
 *   - "snack-bar" → slim embossed strip (single-portion snack stick)
 *
 * The bar and snack-bar visuals follow the design handoff's `Bar` and
 * `SnackBar` components: each segment is its own div with inset highlight
 * (top-left) + inset shadow (bottom-right) so the whole tile reads as a
 * pressed, moulded chocolate piece — not a flat slab with painted-on lines.
 *
 * Component name is kept as `BonbonDisc` for backward compatibility — it's
 * imported from many call sites and the historical disc is one of its
 * outputs. New code can read it as "the Bonbon visual".
 *
 * The Shop never renders product photos: too noisy at the sizes we use
 * (14–65 px). Callers pass a pre-resolved `ShopProductInfo` (see
 * `resolveShopColor` in `lib/shopColor.ts`) — if a caller doesn't have
 * one, pass `undefined` and the disc shows the empty/dashed placeholder.
 */
export interface BonbonDiscProps {
  info: ShopProductInfo | undefined;
  /** The dominant dimension. Round/square shapes use it for both width and
   *  height; horizontal shapes (bar/snack-bar) use it as the width and pick
   *  a smaller height to match the natural aspect ratio. */
  size: number;
  ariaHidden?: boolean;
}

const MOULDED_OVERLAY =
  "radial-gradient(circle at 30% 28%, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 35%), " +
  "radial-gradient(circle at 65% 75%, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0) 45%)";

const MOULDED_SHADOW = "inset 0 -2px 4px rgba(0,0,0,0.18), 0 1px 2px rgba(74,51,36,0.15)";

// Enrobed: matte finish — subtle top sheen, soft bottom shadow, no specular highlight.
const ENROBED_OVERLAY =
  "linear-gradient(180deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 30%, rgba(0,0,0,0.18) 100%)";

const ENROBED_SHADOW =
  "inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -2px 3px rgba(0,0,0,0.30), 0 1px 2px rgba(74,51,36,0.18)";

// Outer shadow shared by bar + snack-bar — top sheen, bottom-edge shadow,
// soft drop shadow off the bottom. Matches the handoff's bar shell.
const SEGMENTED_SHADOW =
  "inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -1px 2px rgba(0,0,0,0.35), 0 1px 2px rgba(15,10,6,0.18)";

// Per-segment emboss — inset highlight on the top-left, inset shadow on the
// bottom-right. Stacked enough times to read at small sizes.
const SEGMENT_SHADOW =
  "inset 1px 1px 0 rgba(255,255,255,0.12), inset -1px -1px 0 rgba(0,0,0,0.35)";

export function BonbonDisc({ info, size, ariaHidden }: BonbonDiscProps) {
  if (!info) {
    return (
      <div
        aria-hidden
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          background: "#f0ebe2",
          border: "1px dashed rgba(74,51,36,0.2)",
        }}
      />
    );
  }

  // Bar + snack-bar render as segmented grids — the handoff's signature
  // "embossed tablet" look. They share a common renderer; only the segment
  // count and aspect ratio differ.
  if (info.kind === "bar") {
    return <SegmentedBar info={info} size={size} ariaHidden={ariaHidden} cols={5} rows={3} aspect={0.48} initialFontMul={0.45} />;
  }
  if (info.kind === "snack-bar") {
    return <SegmentedBar info={info} size={size} ariaHidden={ariaHidden} cols={4} rows={1} aspect={0.22} initialFontMul={0.55} />;
  }

  const { width, height, borderRadius, overlay, shadow, allowsLetter } = shapeFor(info.kind, size);
  const showLetter = allowsLetter && size >= 28;

  return (
    <div
      aria-label={ariaHidden ? undefined : info.name}
      aria-hidden={ariaHidden || undefined}
      title={info.name}
      data-shop-color={info.color}
      data-shop-kind={info.kind}
      style={{
        width,
        height,
        borderRadius,
        boxShadow: shadow,
        background: `${overlay}, ${info.color}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "rgba(255,255,255,0.9)",
        fontWeight: 500,
        letterSpacing: "-0.02em",
      }}
    >
      {showLetter && (
        <span
          style={{
            fontSize: Math.round(size * 0.42),
            textShadow: "0 1px 2px rgba(0,0,0,0.3)",
          }}
        >
          {info.name.charAt(0).toUpperCase()}
        </span>
      )}
    </div>
  );
}

/**
 * Embossed segmented tablet — used for both bar and snack-bar kinds.
 *
 * Geometry follows the handoff's `Bar` / `SnackBar` components: an outer
 * card with subtle gloss + drop shadow, plus a centered `cols × rows` grid
 * where each cell carries its own inset highlight + shadow. A single
 * letter sits in the top-left corner if the visual is large enough.
 */
function SegmentedBar({
  info,
  size,
  ariaHidden,
  cols,
  rows,
  aspect,
  initialFontMul,
}: {
  info: ShopProductInfo;
  size: number;
  ariaHidden?: boolean;
  cols: number;
  rows: number;
  /** height ÷ width — bar ≈ 0.48 (5:3 grid), snack-bar ≈ 0.2 (4×1 strip). */
  aspect: number;
  /** Font scaling for the initial letter relative to segment size. Snack-bar
   *  has shorter segments so it needs a larger ratio to stay readable. */
  initialFontMul: number;
}) {
  const w = size;
  const h = Math.max(rows * 6, Math.round(size * aspect));
  const pad = Math.max(2, Math.round(Math.min(w, h) * 0.06));
  const gridW = w - pad * 2;
  const gridH = h - pad * 2;
  const segW = gridW / cols;
  const segH = gridH / rows;
  const seg = Math.min(segW, segH);
  const showLetter = seg >= 12;
  const initial = info.name.charAt(0).toUpperCase();

  return (
    <div
      aria-label={ariaHidden ? undefined : info.name}
      aria-hidden={ariaHidden || undefined}
      title={info.name}
      data-shop-color={info.color}
      data-shop-kind={info.kind}
      style={{
        position: "relative",
        width: w,
        height: h,
        background: info.color,
        borderRadius: Math.max(2, Math.round(seg * 0.18)),
        boxShadow: SEGMENTED_SHADOW,
        padding: pad,
        boxSizing: "border-box",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "relative",
          width: gridW,
          height: gridH,
          margin: "auto",
          display: "grid",
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gridTemplateRows: `repeat(${rows}, 1fr)`,
        }}
      >
        {Array.from({ length: cols * rows }, (_, i) => (
          <div key={i} style={{ boxShadow: SEGMENT_SHADOW }} />
        ))}
        {showLetter && (
          <span
            style={{
              position: "absolute",
              top: rows === 1 ? "50%" : pad,
              left: pad + 1,
              transform: rows === 1 ? "translateY(-50%)" : undefined,
              fontFamily: "var(--font-mono, ui-monospace, monospace)",
              fontSize: Math.max(7, Math.round(seg * initialFontMul)),
              color: "rgba(0,0,0,0.55)",
              letterSpacing: "0.04em",
              fontWeight: 500,
              pointerEvents: "none",
            }}
          >
            {initial}
          </span>
        )}
      </div>
    </div>
  );
}

function shapeFor(kind: ShopProductInfo["kind"], size: number): {
  width: number;
  height: number;
  borderRadius: number | string;
  overlay: string;
  shadow: string;
  allowsLetter: boolean;
} {
  switch (kind) {
    case "enrobed":
      return {
        width: size,
        height: Math.round(size * 0.92),
        borderRadius: 3,
        overlay: ENROBED_OVERLAY,
        shadow: ENROBED_SHADOW,
        allowsLetter: false,
      };
    case "moulded":
    default:
      return {
        width: size,
        height: size,
        borderRadius: "50%",
        overlay: MOULDED_OVERLAY,
        shadow: MOULDED_SHADOW,
        allowsLetter: true,
      };
  }
}

// Re-export for back-compat with older call sites that still reference the
// legacy fallback helper by name.
export { hashedFallbackColor as bonbonFallbackColor };
