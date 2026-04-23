import type { ShopProductInfo } from "@/lib/shopColor";
import { hashedFallbackColor } from "@/lib/shopColor";

/**
 * A round chocolate disc for every Shop surface (palette tiles, cavity
 * contents, chip summaries).
 *
 * Visual model:
 *   - A glossy radial-gradient overlay (top-left highlight, bottom-right
 *     shadow) sits on top of the product's shop colour.
 *   - At ≥ 28 px the product's first letter is overlaid in white.
 *
 * The Shop never renders product photos: too noisy at the sizes we use
 * (14–65 px). Callers pass a pre-resolved `ShopProductInfo` (see
 * `resolveShopColor` in `lib/shopColor.ts`) — if a caller doesn't have
 * one, pass `undefined` and the disc shows the empty/dashed placeholder.
 */
export interface BonbonDiscProps {
  info: ShopProductInfo | undefined;
  size: number;
  ariaHidden?: boolean;
}

const GLOSS_OVERLAY =
  "radial-gradient(circle at 30% 28%, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 35%), " +
  "radial-gradient(circle at 65% 75%, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0) 45%)";

const DISC_SHADOW = "inset 0 -2px 4px rgba(0,0,0,0.18), 0 1px 2px rgba(74,51,36,0.15)";

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

  const showLetter = size >= 28;
  return (
    <div
      aria-label={ariaHidden ? undefined : info.name}
      aria-hidden={ariaHidden || undefined}
      title={info.name}
      data-shop-color={info.color}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        boxShadow: DISC_SHADOW,
        background: `${GLOSS_OVERLAY}, ${info.color}`,
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

// Re-export for back-compat with older call sites that still reference the
// legacy fallback helper by name.
export { hashedFallbackColor as bonbonFallbackColor };
