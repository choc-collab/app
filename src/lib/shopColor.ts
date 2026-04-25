/**
 * Shop display colour for a product.
 *
 * Resolution order:
 *   1. `product.shopColor` — explicit pick from the product editor.
 *   2. First material with a non-empty `color` found on a **colour-phase**
 *      `ShellDesignStep`, walking the shellDesign array and materials in
 *      declaration order. Applies to any colour-phase technique (airbrush,
 *      brushing, splatter, transfer sheet, …), not just airbrush.
 *   3. `resolveShopColor` additionally falls back to a deterministic hash
 *      of the product name (the same "cocoa family" palette the fallback
 *      bonbon tiles used before we had the field).
 *
 * `deriveShopColor` returns `undefined` when there's nothing to derive from
 * the design — callers (e.g. the product editor showing the "auto" preview)
 * use that to decide whether to label the swatch "auto" or "none".
 *
 * All functions are pure. No React, no DB access — callers provide
 * `materialColorById` (from `db.decorationMaterials`).
 */

import type { Product, ShellDesignStep, ShopKind } from "@/types";
import { normalizeApplyAt } from "@/types";

/** Minimal product shape the derivation needs. Declared so the Shop list
 *  views can pass trimmed rows (no `photo`, no timestamps) without
 *  widening types. */
export interface ShopColorProduct {
  id?: string;
  name: string;
  shopColor?: string;
  shellDesign?: ShellDesignStep[];
}

/** Structured info every Shop surface (landing, picker, palette, tray)
 *  consumes when it needs to render a bonbon swatch. `kind` drives the visual
 *  shape (round disc / square slab / horizontal bar / snack-bar) — resolved
 *  upstream from the product's category. */
export interface ShopProductInfo {
  id: string;
  name: string;
  color: string;
  kind: ShopKind;
}

/** Default kind used when a product has no category, or its category has no
 *  `shopKind` set yet (legacy categories pre-dating the field). Round disc is
 *  the safest fallback — it's the most common shape and the one the Shop has
 *  always rendered. */
export const DEFAULT_SHOP_KIND: ShopKind = "moulded";

/** First colour-phase material color found in the shellDesign. Returns
 *  `undefined` when no design exists, all steps are non-colour phases, or
 *  every colour-phase material lacks a `color`. */
export function deriveShopColor(
  product: ShopColorProduct,
  materialColorById: ReadonlyMap<string, string | undefined>,
): string | undefined {
  if (product.shopColor) return product.shopColor;
  const design = product.shellDesign;
  if (!design || design.length === 0) return undefined;

  for (const step of design) {
    if (normalizeApplyAt(step.applyAt) !== "colour") continue;
    for (const materialId of step.materialIds) {
      const color = materialColorById.get(materialId);
      if (color && color.trim() !== "") return color.trim();
    }
  }
  return undefined;
}

/** Full resolver for rendering. Always returns a colour — falls back to a
 *  deterministic hash of the product name when neither explicit nor derived
 *  colour is available. Keeps the Shop visually consistent even for
 *  products with no shell design data. */
export function resolveShopColor(
  product: ShopColorProduct,
  materialColorById: ReadonlyMap<string, string | undefined>,
): string {
  const explicit = deriveShopColor(product, materialColorById);
  if (explicit) return explicit;
  return hashedFallbackColor(product.name);
}

/** Deterministic cocoa-family tone derived from a product name. Kept in this
 *  file (instead of `cavity-preview.tsx`) so non-component call sites (tests,
 *  helpers, label rendering) can reuse the exact same palette. */
export function hashedFallbackColor(name: string): string {
  const h = hashString(name);
  // Warm band across cocoa / amber / caramel (20°–50°) so fallbacks read as
  // "chocolate tones" rather than arbitrary pastels.
  const hue = 20 + (h % 30);
  const sat = 35 + ((h >> 3) % 25);
  const light = 40 + ((h >> 6) % 15);
  return `hsl(${hue}, ${sat}%, ${light}%)`;
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}
