import type { ShopProductInfo } from "@/lib/shopColor";
import { BonbonDisc } from "./bonbon-disc";

/**
 * Interactive snack-pack tray — a vertical stack of slim horizontal slots
 * that mirror how snack-bar 2/3/4-packs actually ship: long bars stacked
 * in a kraft sleeve.
 *
 * Mirrors the design handoff's `SnackPack` component (a stack of
 * `<SnackBar>` visuals) plus the tap-cavity-then-tap-bonbon UX from
 * `SaleCavityTray`. We deliberately avoid the cocoa divider-frame box
 * here — a snack pack is a paper sleeve, not a moulded gift box.
 *
 * Each slot is:
 *   - Empty + inactive  → soft outlined rectangle (kraft tone)
 *   - Empty + active    → dashed lilac border + small "TAP" hint
 *   - Filled            → the snack-bar's `BonbonDisc` rendered at full
 *                         slot width so its embossed segments line up
 *                         with the slot edges.
 */
export interface SnackPackTrayProps {
  cells: readonly (string | null)[];
  activeIndex: number | null;
  productInfoById: Map<string, ShopProductInfo>;
  onSelect: (index: number) => void;
  onClear: (index: number) => void;
  /** Width of an individual slot. Default tuned to the give-away page. */
  slotWidth?: number;
}

export function SnackPackTray({
  cells,
  activeIndex,
  productInfoById,
  onSelect,
  onClear,
  slotWidth = 240,
}: SnackPackTrayProps) {
  const slotHeight = Math.round(slotWidth * 0.22); // matches snack-bar aspect
  const gap = 6;
  const pad = 12;

  return (
    <div
      role="group"
      aria-label={`Snack pack with ${cells.length} slots`}
      style={{
        display: "inline-flex",
        flexDirection: "column",
        gap,
        padding: pad,
        // Warm kraft sleeve — softer than the cocoa gift-box frame so the
        // paper-band feel reads at a glance.
        background: "linear-gradient(180deg, #efe2c8 0%, #e2d2b2 100%)",
        borderRadius: 6,
        boxShadow:
          "0 4px 12px rgba(74,51,36,0.18), inset 0 1px 0 rgba(255,255,255,0.45), inset 0 -1px 0 rgba(74,51,36,0.10)",
      }}
    >
      {cells.map((pid, i) => {
        const info = pid ? productInfoById.get(pid) : undefined;
        const active = i === activeIndex;
        const filled = pid != null;
        const label = info
          ? `Slot ${i + 1}: ${info.name} — tap to clear`
          : active
            ? `Slot ${i + 1}: active, tap a snack bar`
            : `Slot ${i + 1}: empty, tap to select`;
        return (
          <button
            key={i}
            type="button"
            onClick={() => (filled ? onClear(i) : onSelect(i))}
            aria-label={label}
            aria-pressed={active}
            data-testid={`shop-cavity-${i}`}
            data-filled={filled ? "true" : "false"}
            data-active={active ? "true" : "false"}
            style={{
              width: slotWidth,
              height: slotHeight,
              padding: 0,
              background: "transparent",
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 4,
              transition: "transform 120ms",
            }}
          >
            {info ? (
              <BonbonDisc info={info} size={slotWidth} ariaHidden />
            ) : (
              <EmptySlot active={active} width={slotWidth} height={slotHeight} />
            )}
          </button>
        );
      })}
    </div>
  );
}

function EmptySlot({
  active,
  width,
  height,
}: {
  active: boolean;
  width: number;
  height: number;
}) {
  return (
    <div
      style={{
        width,
        height,
        boxSizing: "border-box",
        background: active ? "rgba(90,61,115,0.06)" : "rgba(74,51,36,0.06)",
        border: active
          ? "2px dashed var(--accent-lilac-ink, #5a3d73)"
          : "1px dashed rgba(74,51,36,0.30)",
        borderRadius: 4,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: active ? "var(--accent-lilac-ink, #5a3d73)" : "rgba(74,51,36,0.55)",
        fontFamily: "var(--font-mono, ui-monospace, monospace)",
        fontSize: 10,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
      }}
    >
      {active ? "Tap a snack bar" : "Empty slot"}
    </div>
  );
}
