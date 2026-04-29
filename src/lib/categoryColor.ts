/**
 * Helpers for rendering FillingCategory colours consistently across the app.
 *
 * The colour stored on FillingCategory.color is a CSS hex (e.g. "#0072B2").
 * The product-cost page renders three derivatives from that single base:
 *   - the bar segment   → the hex itself
 *   - the chip text     → a darkened hex for readable contrast on the chip bg
 *   - the chip bg/edge  → tinted versions of the hex
 *
 * Keeping these derivations in one place means the colour picker preview on
 * the filling-category detail page matches what the product-cost page draws.
 */

import type { FillingCategory } from "@/types";

const FALLBACK_HEX = "#9ca3af"; // tailwind stone-400 — neutral grey

/** Parse a 6-digit hex into [r, g, b] in 0..255. Returns null on bad input. */
function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return null;
  const v = parseInt(m[1], 16);
  return [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
}

function toHex(r: number, g: number, b: number): string {
  const c = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Mix the given hex with white by `ratio` (0 = unchanged, 1 = white). */
function lighten(hex: string, ratio: number): string {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  const [r, g, b] = rgb;
  return toHex(r + (255 - r) * ratio, g + (255 - g) * ratio, b + (255 - b) * ratio);
}

/** Mix the given hex with black by `ratio` (0 = unchanged, 1 = black). */
function darken(hex: string, ratio: number): string {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  const [r, g, b] = rgb;
  return toHex(r * (1 - ratio), g * (1 - ratio), b * (1 - ratio));
}

/** Relative luminance per WCAG. */
function luminance(hex: string): number {
  const rgb = parseHex(hex);
  if (!rgb) return 0.5;
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Picks black or white text for the strongest contrast on a coloured swatch. */
export function contrastingTextColor(hex: string): string {
  return luminance(hex) > 0.55 ? "#1c1917" : "#ffffff";
}

/** Pale tint suitable for a chip background. */
export function tintBg(hex: string): string {
  return lighten(hex, 0.85);
}

/** Slightly less pale tint suitable for a chip border. */
export function tintEdge(hex: string): string {
  return lighten(hex, 0.65);
}

/** Darken the base hue so chip text stays readable on the pale tinted bg.
 *  Bright hues (yellow!) need more darkening than already-dark ones. */
export function chipTextColor(hex: string): string {
  const lum = luminance(hex);
  if (lum > 0.7) return darken(hex, 0.55); // very light hues → strong darken
  if (lum > 0.4) return darken(hex, 0.35);
  return hex;
}

/** Resolve a FillingCategory (or category name + lookup map) to its hex.
 *  Falls back to a neutral grey when the row has no colour set yet. */
export function getCategoryHex(category: FillingCategory | undefined): string {
  return category?.color ?? FALLBACK_HEX;
}

export const NEUTRAL_CATEGORY_HEX = FALLBACK_HEX;
