/**
 * Pure SVG renderers for label templates.
 *
 * Produces a single self-contained `<svg>` string for any (template, context,
 * brand) triple. Same output drives the editor preview and the print pipeline,
 * so what the user designs is exactly what gets printed.
 *
 * Coordinate system: viewBox is `0 0 widthMm heightMm` — every number in the
 * SVG is in millimetres. Font sizes are converted from pt to mm. The renderers
 * are pure functions of their inputs (no Dexie, no React, no `Date.now()`), so
 * the same template renders identically in the browser preview, in a PNG share
 * blob, and in a future Node-side PDF generator.
 *
 * Text measurement is injectable: the browser path uses an `OffscreenCanvas`
 * for accurate widths; node/SSR/test paths fall back to a coarse heuristic.
 * The wrapping output is identical-quality in the browser; the heuristic
 * exists only so tests can run without a DOM.
 */

import QRCode from "qrcode";
import type {
  Brand,
  LabelContext,
  LabelContextIngredient,
  LabelField,
  LabelFieldType,
  LabelTemplate,
  MarketRegion,
} from "@/types";
import { allergenLabel } from "@/types";
import { findSocialNetwork } from "@/lib/socials";
import { getNutrientsByMarket, getNutritionPanelTitle } from "@/lib/nutrition";
import {
  DEFAULT_FONT_FAMILY,
  FIELD_DEFINITIONS,
  effectiveFieldSizePt,
  effectiveLabelWeightG,
  formatLabelDate,
  formatNetWeight,
  resolveFontFamily,
} from "@/lib/labelFields";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MM_PER_INCH = 25.4;
const PT_TO_MM = MM_PER_INCH / 72;

/** Convert a font size from pt to the mm units our SVG viewBox uses. */
function ptToMm(pt: number): number {
  return pt * PT_TO_MM;
}

/** Default font family used when a field doesn't override via `props.font`.
 *  Re-exported from `labelFields` so the curated FONT_OPTIONS list and the
 *  renderer agree on what "default" means. */
const FONT_FAMILY = DEFAULT_FONT_FAMILY;

const COLOR_TEXT = "#222222";
const COLOR_TEXT_DIM = "#444444";
const COLOR_TEXT_MUTED = "#666666";
const COLOR_TEXT_PLACEHOLDER = "#888888";
const COLOR_BORDER = "#111111";
const PLACEHOLDER = "—";

// ---------------------------------------------------------------------------
// Text measurement
// ---------------------------------------------------------------------------

/** Returns the rendered width (in user units == mm) of `text` at `fontMm`.
 *  `fontFamily` is optional — the heuristic ignores it, the browser measurer
 *  uses it so wrap points match the actual rendered font. */
export type TextMeasurer = (
  text: string,
  fontMm: number,
  weight?: number,
  fontFamily?: string,
) => number;

let _measureCtx: CanvasRenderingContext2D | null = null;
function getBrowserMeasureCtx(): CanvasRenderingContext2D | null {
  if (typeof document === "undefined") return null;
  if (_measureCtx) return _measureCtx;
  const c = document.createElement("canvas");
  _measureCtx = c.getContext("2d");
  return _measureCtx;
}

/**
 * Browser-accurate measurer. Uses a hidden canvas at 1px-per-mm scale —
 * measureText returns CSS pixels, which equal mm in our viewBox coords.
 */
export const browserMeasurer: TextMeasurer = (text, fontMm, weight = 400, fontFamily) => {
  const ctx = getBrowserMeasureCtx();
  if (!ctx) return heuristicMeasurer(text, fontMm, weight, fontFamily);
  ctx.font = `${weight} ${fontMm}px ${fontFamily ?? FONT_FAMILY}`;
  return ctx.measureText(text).width;
};

/**
 * Heuristic measurer for environments without a DOM (Node, vitest, SSR).
 * Approximates an average glyph width of 0.55em — close enough to produce
 * sensible line breaks at print time, exact widths obviously not guaranteed.
 */
export const heuristicMeasurer: TextMeasurer = (text, fontMm) => {
  return text.length * fontMm * 0.55;
};

/** The measurer the public renderers use by default. Picks `browserMeasurer`
 *  when the DOM is available, else the heuristic. */
export const defaultMeasurer: TextMeasurer =
  typeof document !== "undefined" ? browserMeasurer : heuristicMeasurer;

// ---------------------------------------------------------------------------
// Social icons
// ---------------------------------------------------------------------------

/**
 * Minimal Lucide-style icons for the `socials` field. Each entry is the inner
 * markup for a 24×24 viewBox — the renderer wraps it in a transform that
 * scales to the field's font size in millimetres and places it on the
 * baseline of the URL text. Unknown labels fall through to a plain text
 * prefix so users can still add e.g. "Pinterest" without a missing icon.
 *
 * Stroke icons rely on `currentColor` so they inherit the field's text fill.
 * Filled icons set fill explicitly.
 */
const SOCIAL_ICONS: Record<string, string> = {
  instagram:
    '<rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" stroke-width="2"/>' +
    '<circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/>' +
    '<circle cx="17.5" cy="6.5" r="1.2" fill="currentColor"/>',
  facebook:
    '<path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" fill="currentColor"/>',
  x:
    '<path d="M3 3 L 21 21 M 21 3 L 3 21" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>',
  twitter:
    '<path d="M22 4 c -1 1 -2 1 -3 1 c -1 -1 -3 -1 -4 -1 c -3 0 -5 2 -5 5 c 0 0 0 1 0 1 c -4 0 -7 -2 -10 -5 c -1 2 0 4 2 5 c -1 0 -2 0 -3 -1 c 0 2 1 4 4 4 c -1 0 -1 0 -2 0 c 1 2 3 3 5 3 c -1 1 -4 2 -6 2 c 2 1 5 2 7 2 c 9 0 14 -8 14 -14 c 1 -1 2 -1 3 -2 z" fill="currentColor"/>',
  tiktok:
    '<path d="M16 4 c 0 3 2 5 5 5 V 13 c -2 0 -4 -1 -5 -2 v 6 a 5 5 0 1 1 -5 -5 v 3 a 2 2 0 1 0 2 2 V 4 z" fill="currentColor"/>',
  youtube:
    '<rect x="2" y="6" width="20" height="12" rx="3" fill="currentColor"/>' +
    '<path d="M10 9 L 16 12 L 10 15 Z" fill="white"/>',
  linkedin:
    '<rect x="3" y="3" width="18" height="18" rx="2" fill="currentColor"/>' +
    '<rect x="6" y="10" width="2.5" height="8" fill="white"/>' +
    '<circle cx="7.25" cy="7.25" r="1.5" fill="white"/>' +
    '<path d="M11 10 v 8 h 2.5 v -4 a 1.5 1.5 0 0 1 3 0 v 4 H 19 v -4.5 c 0 -2 -1.5 -3.5 -3.5 -3.5 c -1 0 -1.8 0.5 -2 1 v -1 z" fill="white"/>',
  email:
    '<rect x="2" y="5" width="20" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="2"/>' +
    '<path d="M2 7 L 12 14 L 22 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  phone:
    '<path d="M5 3 h 4 l 2 5 l -3 2 c 1 3 3 5 6 6 l 2 -3 l 5 2 v 4 c 0 1 -1 2 -2 2 c -10 0 -18 -8 -18 -18 c 0 -1 1 -2 2 -2 z" fill="currentColor"/>',
  whatsapp:
    '<path d="M3.5 20.5 L 4.7 16.5 a 9 9 0 1 1 3.3 3.3 z" fill="currentColor"/>' +
    '<path d="M9 9 c 0 4 3 7 6 7 l 1 -1 l -2 -1 l -1 0.5 c -1 -0.5 -2 -1.5 -2.5 -2.5 l 0.5 -1 l -1 -2 z" fill="white"/>',
  globe:
    '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/>' +
    '<ellipse cx="12" cy="12" rx="4" ry="9" fill="none" stroke="currentColor" stroke-width="2"/>' +
    '<path d="M3 12 H 21" fill="none" stroke="currentColor" stroke-width="2"/>',
};

/** Common label spellings that resolve to the same icon. */
const SOCIAL_ICON_ALIASES: Record<string, string> = {
  insta: "instagram",
  ig: "instagram",
  fb: "facebook",
  meta: "facebook",
  yt: "youtube",
  "x.com": "x",
  twitter: "twitter",
  tiktok: "tiktok",
  mail: "email",
  "e-mail": "email",
  tel: "phone",
  call: "phone",
  mobile: "phone",
  wa: "whatsapp",
  website: "globe",
  site: "globe",
  www: "globe",
  web: "globe",
  url: "globe",
  link: "globe",
  homepage: "globe",
};

function resolveSocialIcon(label: string): string | null {
  const key = label.trim().toLowerCase();
  if (!key) return null;
  // Try the catalog first so curated display labels like "Website" resolve to
  // the canonical id ("globe") which keys the icon map.
  const def = findSocialNetwork(key);
  if (def && SOCIAL_ICONS[def.id]) return SOCIAL_ICONS[def.id];
  if (SOCIAL_ICONS[key]) return SOCIAL_ICONS[key];
  const aliased = SOCIAL_ICON_ALIASES[key];
  if (aliased) return SOCIAL_ICONS[aliased] ?? null;
  return null;
}

// ---------------------------------------------------------------------------
// String helpers
// ---------------------------------------------------------------------------

/** XML-escape a string for safe inclusion in attribute values or text nodes. */
function esc(s: string | undefined | null): string {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Format a number for SVG output — strips trailing zeros, max 3 decimals. */
function fmt(n: number): string {
  if (!Number.isFinite(n)) return "0";
  // Round to 3dp then trim
  const rounded = Math.round(n * 1000) / 1000;
  return String(rounded);
}

/**
 * Greedy word-wrap. Honours explicit `\n` first, then breaks each source line
 * into chunks that fit within `maxWidthMm`. Words that exceed the width on
 * their own are left intact (no mid-word breaks) — keeps ingredient names
 * readable rather than cutting them mid-syllable.
 */
export function wrapLines(
  text: string,
  maxWidthMm: number,
  fontMm: number,
  weight: number,
  measure: TextMeasurer = defaultMeasurer,
  fontFamily?: string,
): string[] {
  if (!text) return [];
  const out: string[] = [];
  for (const src of text.split("\n")) {
    if (!src) { out.push(""); continue; }
    if (measure(src, fontMm, weight, fontFamily) <= maxWidthMm) { out.push(src); continue; }
    const words = src.split(" ");
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (measure(candidate, fontMm, weight, fontFamily) <= maxWidthMm) {
        current = candidate;
      } else {
        if (current) out.push(current);
        current = word;
      }
    }
    if (current) out.push(current);
  }
  return out;
}

// ---------------------------------------------------------------------------
// QR rendering
// ---------------------------------------------------------------------------

/**
 * Render a QR code as a grid of black squares scaled to fit the field box.
 * Falls back to a hatched placeholder when `text` is empty or generation fails
 * (e.g. extremely long input that exceeds the chosen error-correction level).
 *
 * Output is pure SVG markup with no foreign objects, so it rasterizes cleanly
 * through the same canvas pipeline as everything else.
 */
function renderQrSvg(text: string, w: number, h: number): string {
  if (!text) return placeholderQr(w, h);
  let matrix: { size: number; data: Uint8Array };
  try {
    const code = QRCode.create(text, { errorCorrectionLevel: "M" });
    matrix = { size: code.modules.size, data: code.modules.data as Uint8Array };
  } catch {
    return placeholderQr(w, h);
  }

  const side = Math.min(w, h);
  const cell = side / matrix.size;
  const offX = (w - side) / 2;
  const offY = (h - side) / 2;

  const rects: string[] = [];
  for (let y = 0; y < matrix.size; y++) {
    let x = 0;
    while (x < matrix.size) {
      if (matrix.data[y * matrix.size + x]) {
        let run = 1;
        while (x + run < matrix.size && matrix.data[y * matrix.size + x + run]) run++;
        rects.push(
          `<rect x="${fmt(offX + x * cell)}" y="${fmt(offY + y * cell)}" width="${fmt(run * cell)}" height="${fmt(cell)}" />`,
        );
        x += run;
      } else {
        x++;
      }
    }
  }
  return (
    `<rect x="0" y="0" width="${fmt(w)}" height="${fmt(h)}" fill="#ffffff" />` +
    `<g fill="${COLOR_BORDER}" shape-rendering="crispEdges">${rects.join("")}</g>`
  );
}

function placeholderQr(w: number, h: number): string {
  const m = Math.min(w, h);
  const c = m * 0.18;
  return (
    `<rect x="0" y="0" width="${fmt(w)}" height="${fmt(h)}" fill="#ffffff" stroke="${COLOR_BORDER}" stroke-width="0.15" />` +
    `<rect x="${fmt(m * 0.1)}" y="${fmt(m * 0.1)}" width="${fmt(c)}" height="${fmt(c)}" fill="${COLOR_BORDER}" />` +
    `<rect x="${fmt(w - m * 0.1 - c)}" y="${fmt(m * 0.1)}" width="${fmt(c)}" height="${fmt(c)}" fill="${COLOR_BORDER}" />` +
    `<rect x="${fmt(m * 0.1)}" y="${fmt(h - m * 0.1 - c)}" width="${fmt(c)}" height="${fmt(c)}" fill="${COLOR_BORDER}" />`
  );
}

// ---------------------------------------------------------------------------
// SVG element helpers
// ---------------------------------------------------------------------------

interface TextOpts {
  fontMm: number;
  weight?: number;
  /** Optional font-family override. Defaults to the system stack. */
  fontFamily?: string;
  fill?: string;
  anchor?: "start" | "middle" | "end";
  italic?: boolean;
  letterSpacing?: number; // in mm
}

/** Emits a single-line `<text>` element. `y` is the top of the glyph box. */
function textEl(content: string, x: number, y: number, opts: TextOpts): string {
  const {
    fontMm,
    weight = 400,
    fontFamily = FONT_FAMILY,
    fill = COLOR_TEXT,
    anchor = "start",
    italic = false,
    letterSpacing,
  } = opts;
  const attrs: string[] = [
    `x="${fmt(x)}"`,
    `y="${fmt(y)}"`,
    `font-family="${esc(fontFamily)}"`,
    `font-size="${fmt(fontMm)}"`,
  ];
  if (weight !== 400) attrs.push(`font-weight="${weight}"`);
  if (italic) attrs.push(`font-style="italic"`);
  attrs.push(`fill="${fill}"`);
  if (anchor !== "start") attrs.push(`text-anchor="${anchor}"`);
  if (letterSpacing) attrs.push(`letter-spacing="${fmt(letterSpacing)}"`);
  attrs.push(`dominant-baseline="hanging"`);
  return `<text ${attrs.join(" ")}>${esc(content)}</text>`;
}

/** Emits a multi-line block as a sequence of `<text>` elements. Returns the
 *  block of SVG; `lineHeightMm` defaults to fontMm × 1.2. */
function multiLine(
  lines: string[],
  x: number,
  y: number,
  opts: TextOpts & { lineHeightMm?: number },
): string {
  const lh = opts.lineHeightMm ?? opts.fontMm * 1.2;
  return lines
    .map((line, i) => textEl(line, x, y + i * lh, opts))
    .join("");
}

// ---------------------------------------------------------------------------
// Renderer registry
// ---------------------------------------------------------------------------

export interface SvgRenderInput {
  field: LabelField;
  context: LabelContext | null;
  brand: Brand;
  template: Pick<LabelTemplate, "piecesPerLabel"> | null;
  marketRegion?: MarketRegion;
  measure: TextMeasurer;
}

type SvgFieldRenderer = (input: SvgRenderInput) => string;

/**
 * Resolve the effective font weight for a text field. The user's `bold`
 * toggle overrides toward 700; otherwise fall back to the legacy `weight`
 * prop (templates saved before `bold` existed) and finally to the field's
 * natural default — which differs by field type (`name` is semibold, `aller`
 * is mandatorily bold, everything else is 400).
 */
function effectiveWeight(
  p: { bold?: boolean; weight?: number },
  naturalDefault: number,
): number {
  if (p.bold) return 700;
  if (p.weight !== undefined) return p.weight;
  return naturalDefault;
}

const RENDERERS: Record<LabelFieldType, SvgFieldRenderer> = {
  // ────────────────────── product / batch ──────────────────────
  name: ({ field, context, measure }) => {
    const p = field.props ?? {};
    const fontMm = ptToMm(effectiveFieldSizePt("name", p.size));
    const fontFamily = resolveFontFamily(p.font);
    const weight = effectiveWeight(p, 600);
    // Wrap by the field's box width so long product names break across lines
    // when the user keeps the box narrow — dragging the box wider lets more
    // characters fit per line.
    const lines = wrapLines(context?.name || PLACEHOLDER, field.w, fontMm, weight, measure, fontFamily);
    return multiLine(lines, 0, 0, {
      fontMm,
      fontFamily,
      weight,
      italic: !!p.italic,
      letterSpacing: -fontMm * 0.02,
      lineHeightMm: fontMm * 1.05,
    });
  },

  subtitle: ({ field, measure }) => {
    const p = field.props ?? {};
    const fontMm = ptToMm(effectiveFieldSizePt("subtitle", p.size));
    const fontFamily = resolveFontFamily(p.font);
    const lines = wrapLines(p.text || PLACEHOLDER, field.w, fontMm, 400, measure, fontFamily);
    return multiLine(lines, 0, 0, {
      fontMm,
      fontFamily,
      weight: effectiveWeight(p, 400),
      italic: !!p.italic,
      fill: COLOR_TEXT_DIM,
    });
  },

  weight: ({ field, context, template }) => {
    const p = field.props ?? {};
    const fontMm = ptToMm(effectiveFieldSizePt("weight", p.size));
    return textEl(
      formatNetWeight(effectiveLabelWeightG(context, template)),
      0,
      0,
      {
        fontMm,
        fontFamily: resolveFontFamily(p.font),
        weight: effectiveWeight(p, 400),
        italic: !!p.italic,
      },
    );
  },

  ingr: ({ field, context, measure }) => {
    const p = field.props ?? {};
    const fontMm = ptToMm(effectiveFieldSizePt("ingr", p.size));
    const fontFamily = resolveFontFamily(p.font);
    const lineHeight = fontMm * 1.42;
    const ings = context?.ingredients ?? [];
    if (ings.length === 0) {
      return textEl(PLACEHOLDER, 0, 0, { fontMm, fontFamily, fill: COLOR_TEXT });
    }
    return renderIngredientLinesSvg(
      ings,
      field.w,
      fontMm,
      lineHeight,
      p.boldAllergens !== false,
      effectiveWeight(p, 400),
      !!p.italic,
      fontFamily,
      measure,
    );
  },

  aller: ({ field, context, measure }) => {
    const p = field.props ?? {};
    const fontMm = ptToMm(effectiveFieldSizePt("aller", p.size));
    const fontFamily = resolveFontFamily(p.font);
    const lineHeight = fontMm * 1.42;
    const allergens = context?.allergens ?? [];
    const mayContain = context?.mayContain ?? [];
    // `aller` is mandatorily bold for regulatory reasons — natural default 700.
    const weight = effectiveWeight(p, 700);
    // The "Contains:" prefix is FALCPA's mandatory phrasing in the US and the
    // de-facto standard in EU/UK label practice. Inline with the allergen list
    // so it wraps naturally; opt-out via `showLabel: false` for users who
    // prefer the bare layout.
    const showPrefix = p.showLabel !== false;
    const parts: string[] = [];
    let yCursor = 0;
    if (allergens.length > 0) {
      const body = allergens.map(allergenLabel).join(", ");
      const declaration = showPrefix ? `Contains: ${body}` : body;
      const declLines = wrapLines(declaration, field.w, fontMm, weight, measure, fontFamily);
      for (const line of declLines) {
        parts.push(textEl(line, 0, yCursor, { fontMm, fontFamily, weight, italic: !!p.italic }));
        yCursor += lineHeight;
      }
    } else {
      parts.push(textEl(PLACEHOLDER, 0, 0, { fontMm, fontFamily, fill: COLOR_TEXT_PLACEHOLDER }));
      yCursor += lineHeight;
    }
    // May-contain line stays italic + muted by convention (advisory tone);
    // also wraps by width so it can span multiple lines below the declaration.
    if (mayContain.length > 0) {
      const mcBody = mayContain.map(allergenLabel).join(", ");
      const mc = showPrefix ? `May contain: ${mcBody}` : mcBody;
      const mcLines = wrapLines(mc, field.w, fontMm, 400, measure, fontFamily);
      for (const line of mcLines) {
        parts.push(textEl(line, 0, yCursor, {
          fontMm,
          fontFamily,
          fill: COLOR_TEXT_MUTED,
          italic: true,
        }));
        yCursor += lineHeight;
      }
    }
    return parts.join("");
  },

  nutri: ({ field, context, marketRegion }) => {
    const p = field.props ?? {};
    const fontMm = ptToMm(effectiveFieldSizePt("nutri", p.size));
    const fontFamily = resolveFontFamily(p.font);
    const market: MarketRegion = marketRegion ?? "EU";
    const data = context?.nutritionPer100g ?? {};
    const nutrients = getNutrientsByMarket(market);
    const baseWeight = effectiveWeight(p, 400);
    // Title shown by default; opt-out via `showLabel: false` for users who
    // want a bare table.
    const showTitle = p.showLabel !== false;

    // ── Table geometry ──────────────────────────────────────────────────
    const titleFontMm = fontMm * 1.15;
    const headerFontMm = fontMm * 0.85;
    const rowH = fontMm * 1.4;
    const titleH = titleFontMm * 1.6;
    const hdrH = headerFontMm * 1.6;
    const padX = fontMm * 0.45;
    const indentStep = fontMm * 1.05;
    // Slight vertical nudge so hanging-baseline text optically centres in rows.
    const rowTextNudge = fontMm * 0.05;

    // Rule weights in mm — US/CA get noticeably heavier rules to evoke the
    // FDA-style panel without claiming full pixel-perfect compliance.
    const heavyMarket = market === "US" || market === "CA";
    const outerRule = heavyMarket ? 0.5 : 0.4;
    const titleRule = heavyMarket ? 0.5 : 0.4;
    const sectionRule = heavyMarket ? 0.4 : 0.3;
    const thinRule = 0.15;

    const title = getNutritionPanelTitle(market);

    // ── Pre-process nutrients into row entries ─────────────────────────
    // Collapses the EU/AU "Energy" pair (kJ + kcal) into a single combined
    // row, and inserts a section separator wherever consecutive top-level
    // nutrients change `section`.
    type Entry =
      | { kind: "row"; label: string; indent: number; valueText: string }
      | { kind: "sep" };
    const entries: Entry[] = [];

    const formatVal = (v: number | undefined, unit: string): string => {
      if (v == null) return PLACEHOLDER;
      if (unit === "kJ" || unit === "kcal") return `${Math.round(v)} ${unit}`;
      return `${v} ${unit}`;
    };

    let i = 0;
    let prevSection: string | undefined;
    while (i < nutrients.length) {
      const nut = nutrients[i];
      const next = nutrients[i + 1];
      const isCombinedEnergy =
        nut.key === "energyKj" &&
        next?.key === "energyKcal" &&
        nut.label === next.label &&
        nut.indent === next.indent;

      let valueText: string;
      if (isCombinedEnergy) {
        const kj = data.energyKj;
        const kcal = data.energyKcal;
        const kjStr = kj == null ? PLACEHOLDER : `${Math.round(kj)} kJ`;
        const kcalStr = kcal == null ? PLACEHOLDER : `${Math.round(kcal)} kcal`;
        valueText = `${kjStr} / ${kcalStr}`;
      } else {
        valueText = formatVal(data[nut.key], nut.unit);
      }

      if (prevSection != null && nut.section && nut.section !== prevSection) {
        entries.push({ kind: "sep" });
      }
      entries.push({ kind: "row", label: nut.label, indent: nut.indent, valueText });
      if (nut.section) prevSection = nut.section;

      i += isCombinedEnergy ? 2 : 1;
    }

    // ── Emit SVG ────────────────────────────────────────────────────────
    const parts: string[] = [];
    const innerW = field.w;
    const innerH = field.h;

    // Outer box rule
    parts.push(
      `<rect x="0" y="0" width="${fmt(innerW)}" height="${fmt(innerH)}" ` +
      `fill="none" stroke="${COLOR_BORDER}" stroke-width="${fmt(outerRule)}"/>`,
    );

    let y = 0;

    if (showTitle) {
      parts.push(
        textEl(title, padX, y + (titleH - titleFontMm) / 2 + rowTextNudge, {
          fontMm: titleFontMm,
          fontFamily,
          weight: Math.max(baseWeight, 700),
          italic: !!p.italic,
          fill: COLOR_TEXT,
        }),
      );
      y += titleH;
      parts.push(
        `<line x1="0" y1="${fmt(y)}" x2="${fmt(innerW)}" y2="${fmt(y)}" ` +
        `stroke="${COLOR_BORDER}" stroke-width="${fmt(titleRule)}"/>`,
      );
    }

    // Column header — "per 100g" right-aligned
    parts.push(
      textEl("per 100g", innerW - padX, y + (hdrH - headerFontMm) / 2 + rowTextNudge, {
        fontMm: headerFontMm,
        fontFamily,
        weight: baseWeight,
        italic: true,
        fill: COLOR_TEXT_DIM,
        anchor: "end",
      }),
    );
    y += hdrH;
    parts.push(
      `<line x1="0" y1="${fmt(y)}" x2="${fmt(innerW)}" y2="${fmt(y)}" ` +
      `stroke="${COLOR_BORDER}" stroke-width="${fmt(thinRule)}"/>`,
    );

    for (const e of entries) {
      if (e.kind === "sep") {
        parts.push(
          `<line x1="0" y1="${fmt(y)}" x2="${fmt(innerW)}" y2="${fmt(y)}" ` +
          `stroke="${COLOR_BORDER}" stroke-width="${fmt(sectionRule)}"/>`,
        );
        continue;
      }
      const indentMm = e.indent * indentStep;
      const textY = y + (rowH - fontMm) / 2 + rowTextNudge;
      parts.push(
        textEl(e.label, padX + indentMm, textY, {
          fontMm,
          fontFamily,
          weight: baseWeight,
          italic: !!p.italic,
          fill: COLOR_TEXT,
        }),
      );
      parts.push(
        textEl(e.valueText, innerW - padX, textY, {
          fontMm,
          fontFamily,
          weight: baseWeight,
          italic: !!p.italic,
          fill: COLOR_TEXT,
          anchor: "end",
        }),
      );
      y += rowH;
    }

    return parts.join("");
  },

  bbe: ({ field, context }) => {
    const p = field.props ?? {};
    const fontMm = ptToMm(effectiveFieldSizePt("bbe", p.size));
    const dateStr = formatLabelDate(context?.bestBefore ?? null, p.dateFormat);
    // "Best before:" prefix is the standard EU/UK wording; opt-out via
    // `showLabel: false` for users with very narrow date fields.
    const text = p.showLabel === false ? dateStr : `Best before: ${dateStr}`;
    return textEl(text, 0, 0, {
      fontMm,
      fontFamily: resolveFontFamily(p.font),
      weight: effectiveWeight(p, 400),
      italic: !!p.italic,
    });
  },

  batch: ({ field, context }) => {
    const p = field.props ?? {};
    const fontMm = ptToMm(effectiveFieldSizePt("batch", p.size));
    const body = context?.batchNumber || PLACEHOLDER;
    // "Batch:" prefix mirrors `bbe` / `prodate` so dates and batch codes share
    // a consistent labelling pattern; opt-out via `showLabel: false`.
    const text = p.showLabel === false ? body : `Batch: ${body}`;
    return textEl(text, 0, 0, {
      fontMm,
      fontFamily: resolveFontFamily(p.font),
      weight: effectiveWeight(p, 400),
      italic: !!p.italic,
    });
  },

  prodate: ({ field, context }) => {
    const p = field.props ?? {};
    const fontMm = ptToMm(effectiveFieldSizePt("prodate", p.size));
    const dateStr = formatLabelDate(context?.producedAt ?? null, p.dateFormat);
    const text = p.showLabel === false ? dateStr : `Production date: ${dateStr}`;
    return textEl(text, 0, 0, {
      fontMm,
      fontFamily: resolveFontFamily(p.font),
      weight: effectiveWeight(p, 400),
      italic: !!p.italic,
    });
  },

  origin: ({ field, context }) => {
    const p = field.props ?? {};
    const fontMm = ptToMm(effectiveFieldSizePt("origin", p.size));
    return textEl(context?.origin || PLACEHOLDER, 0, 0, {
      fontMm,
      fontFamily: resolveFontFamily(p.font),
      weight: effectiveWeight(p, 400),
      italic: !!p.italic,
    });
  },

  // ────────────────────── brand / business ──────────────────────
  logo: ({ field, brand }) => {
    if (brand.logo) {
      return `<image x="0" y="0" width="${fmt(field.w)}" height="${fmt(field.h)}" preserveAspectRatio="xMidYMid meet" href="${esc(brand.logo)}" />`;
    }
    return `<rect x="0" y="0" width="${fmt(field.w)}" height="${fmt(field.h)}" rx="0.4" fill="#f5f5f5" stroke="${COLOR_BORDER}" stroke-width="0.15" stroke-dasharray="0.6 0.4" />`;
  },

  company: ({ field, brand, measure }) => {
    const p = field.props ?? {};
    const fontMm = ptToMm(effectiveFieldSizePt("company", p.size));
    const fontFamily = resolveFontFamily(p.font);
    const lineHeight = fontMm * 1.35;
    // The brand name is naturally bold (built-in 700) so it stands out above
    // the address; the user's `bold` toggle forces every line to 700.
    const forceBold = !!p.bold;
    const italic = !!p.italic;
    const lines: Array<{ text: string; bold: boolean }> = [];
    if (brand.name) lines.push({ text: brand.name, bold: true });
    if (brand.address) {
      for (const line of brand.address.split("\n")) {
        for (const wrapped of wrapLines(line, field.w, fontMm, 400, measure, fontFamily)) {
          lines.push({ text: wrapped, bold: forceBold });
        }
      }
    }
    if (lines.length === 0) {
      return textEl(PLACEHOLDER, 0, 0, {
        fontMm,
        fontFamily,
        fill: COLOR_TEXT_PLACEHOLDER,
      });
    }
    return lines
      .map((l, i) =>
        textEl(l.text, 0, i * lineHeight, {
          fontMm,
          fontFamily,
          weight: (l.bold || forceBold) ? 700 : 400,
          italic,
          fill: COLOR_TEXT,
        }),
      )
      .join("");
  },

  contact: ({ field, brand }) => {
    const p = field.props ?? {};
    const fontMm = ptToMm(effectiveFieldSizePt("contact", p.size));
    return textEl(brand.contact || PLACEHOLDER, 0, 0, {
      fontMm,
      fontFamily: resolveFontFamily(p.font),
      weight: effectiveWeight(p, 400),
      italic: !!p.italic,
      fill: COLOR_TEXT_DIM,
    });
  },

  socials: ({ field, brand, measure }) => {
    const p = field.props ?? {};
    const fontMm = ptToMm(effectiveFieldSizePt("socials", p.size));
    const fontFamily = resolveFontFamily(p.font);
    const lineHeight = fontMm * 1.4;
    const weight = effectiveWeight(p, 400);
    const italic = !!p.italic;
    const socials = brand.socials ?? [];
    if (socials.length === 0) {
      return textEl(PLACEHOLDER, 0, 0, {
        fontMm,
        fontFamily,
        fill: COLOR_TEXT_PLACEHOLDER,
      });
    }
    // Icon footprint: a square slightly larger than the cap height so the
    // glyph and the icon share an optical baseline. The text follows with a
    // small gap so it reads as "icon + value" rather than "icon, then value".
    const iconBox = fontMm * 1.05;
    const iconGap = fontMm * 0.35;
    return socials
      .map((s, i) => {
        const y = i * lineHeight;
        const icon = resolveSocialIcon(s.label);
        if (icon) {
          // Wrap icon in a group: translate to the row's top-left, scale 24→iconBox,
          // and set `color` so `currentColor` strokes inherit the body fill.
          const scale = iconBox / 24;
          const iconSvg = `<g transform="translate(0 ${fmt(y)}) scale(${fmt(scale)})" color="${COLOR_TEXT}">${icon}</g>`;
          const urlX = iconBox + iconGap;
          return iconSvg + textEl(s.url, urlX, y, { fontMm, fontFamily, weight, italic, fill: COLOR_TEXT });
        }
        // Fallback for labels with no matching icon — keep the original
        // "label url" layout so users can still surface arbitrary networks.
        const labelStr = `${s.label} `;
        const labelW = measure(labelStr, fontMm, weight, fontFamily);
        return (
          textEl(labelStr, 0, y, { fontMm, fontFamily, weight, italic, fill: COLOR_TEXT_MUTED }) +
          textEl(s.url, labelW, y, { fontMm, fontFamily, weight, italic, fill: COLOR_TEXT })
        );
      })
      .join("");
  },

  qr: ({ field, brand }) => {
    const p = field.props ?? {};
    const url = p.qrUrl || brand.socials?.[0]?.url || "";
    const w = field.w;
    const h = field.h;
    return (
      `<g data-qr-url="${esc(url)}">` +
      renderQrSvg(url, w, h) +
      `</g>`
    );
  },

  // ────────────────────── custom ──────────────────────
  text: ({ field, measure }) => {
    const p = field.props ?? {};
    const fontMm = ptToMm(effectiveFieldSizePt("text", p.size));
    const fontFamily = resolveFontFamily(p.font);
    const lines = wrapLines(p.text || PLACEHOLDER, field.w, fontMm, 400, measure, fontFamily);
    return multiLine(lines, 0, 0, {
      fontMm,
      fontFamily,
      weight: effectiveWeight(p, 400),
      italic: !!p.italic,
      fill: COLOR_TEXT,
    });
  },

  divider: ({ field }) => {
    // Centered horizontal hairline at field's vertical midpoint.
    const y = field.h / 2;
    return `<line x1="0" y1="${fmt(y)}" x2="${fmt(field.w)}" y2="${fmt(y)}" stroke="${COLOR_BORDER}" stroke-width="0.2" />`;
  },

  image: ({ field }) => {
    const p = field.props ?? {};
    if (p.image) {
      return `<image x="0" y="0" width="${fmt(field.w)}" height="${fmt(field.h)}" preserveAspectRatio="xMidYMid meet" href="${esc(p.image)}" />`;
    }
    return `<rect x="0" y="0" width="${fmt(field.w)}" height="${fmt(field.h)}" rx="0.4" fill="#f5f5f5" stroke="${COLOR_TEXT_PLACEHOLDER}" stroke-width="0.15" stroke-dasharray="0.6 0.4" />`;
  },
};

// ---------------------------------------------------------------------------
// Ingredient list — bold allergen tokens with greedy wrap
// ---------------------------------------------------------------------------

/** Render an ingredient list as wrapped multi-line SVG, with each ingredient
 *  name optionally bold-emphasised when it carries an allergen. Returns the
 *  block of SVG. */
function renderIngredientLinesSvg(
  ingredients: ReadonlyArray<LabelContextIngredient>,
  maxWidthMm: number,
  fontMm: number,
  lineHeightMm: number,
  boldAllergens: boolean,
  baseWeight: number,
  italic: boolean,
  fontFamily: string,
  measure: TextMeasurer,
): string {
  // Tokenize: alternating ingredient names and ", " separators. Each token
  // remembers whether it's an "allergen run" so the surrounding line can keep
  // its own weight while the allergen tspan jumps to 700.
  type Tok = { text: string; allergen: boolean };
  const toks: Tok[] = [];
  ingredients.forEach((ing, i) => {
    if (i > 0) toks.push({ text: ", ", allergen: false });
    toks.push({ text: ing.name, allergen: boldAllergens && ing.allergens.length > 0 });
  });

  // Pack tokens into lines greedily, measuring each candidate at its own weight.
  // When a ", " separator doesn't fit, we glue it onto the current line anyway
  // (tiny overflow, ~1mm) rather than starting the next line with a leading
  // comma. Without this, a wrap between "Caster Sugar" and ", Felchlin Sao
  // Palme" would render as ", Felchlin…" on the second line.
  const lines: Tok[][] = [];
  let current: Tok[] = [];
  let currentWidth = 0;
  for (const tok of toks) {
    const isSeparator = tok.text === ", ";
    if (current.length === 0 && isSeparator) {
      // Defensive: never let a line start with a bare separator.
      continue;
    }
    const w = measure(tok.text, fontMm, tok.allergen ? 700 : baseWeight, fontFamily);
    if (currentWidth + w <= maxWidthMm || current.length === 0) {
      current.push(tok);
      currentWidth += w;
    } else if (isSeparator) {
      // Attach the separator to the current line, then close it. The next
      // ingredient will land at the start of a fresh line.
      current.push(tok);
      lines.push(current);
      current = [];
      currentWidth = 0;
    } else {
      lines.push(current);
      current = [tok];
      currentWidth = w;
    }
  }
  if (current.length > 0) lines.push(current);

  // Emit each line as a <text> with <tspan> children for bold/non-bold runs.
  const baseStyleAttrs =
    `font-family="${esc(fontFamily)}" font-size="${fmt(fontMm)}" ` +
    (baseWeight !== 400 ? `font-weight="${baseWeight}" ` : "") +
    (italic ? `font-style="italic" ` : "") +
    `fill="${COLOR_TEXT}" dominant-baseline="hanging"`;
  return lines
    .map((line, i) => {
      const y = i * lineHeightMm;
      const tspans = line
        .map((t) => {
          if (t.allergen) {
            return `<tspan font-weight="700">${esc(t.text)}</tspan>`;
          }
          return esc(t.text);
        })
        .join("");
      return `<text x="0" y="${fmt(y)}" ${baseStyleAttrs}>${tspans}</text>`;
    })
    .join("");
}

// ---------------------------------------------------------------------------
// Public API — render single field, render whole template
// ---------------------------------------------------------------------------

/** Render a single field's inner SVG (positioned at origin, sized w×h). */
export function renderFieldSvg(input: SvgRenderInput): string {
  return RENDERERS[input.field.type](input);
}

export interface RenderTemplateOptions {
  /** Override the default text measurer (heuristic in tests, canvas in browser). */
  measure?: TextMeasurer;
  /** User's market region — drives nutrition table contents. Defaults to EU. */
  marketRegion?: MarketRegion;
  /** When true, emit visible 1-unit borders around each field (debug only). */
  debugFieldBoxes?: boolean;
  /**
   * How to size the root `<svg>` element.
   *   - `"mm"` (default): emit physical-mm `width`/`height`, suitable for
   *     standalone SVG files and print rasterisation at known DPI.
   *   - `"fill"`: emit `width="100%" height="100%"` so the SVG scales to fill
   *     its parent container in the DOM.
   */
  sizing?: "mm" | "fill";
}

/**
 * Render a full template into a standalone SVG string. The output is suitable
 * for inlining in a React preview, serializing into a Blob for sharing, or
 * loading via an Image element to rasterize to a canvas.
 */
export function renderTemplateSvg(
  template: LabelTemplate,
  context: LabelContext | null,
  brand: Brand,
  options: RenderTemplateOptions = {},
): string {
  const measure = options.measure ?? defaultMeasurer;
  const fields = template.fields
    .map((field) => {
      const inner = renderFieldSvg({
        field,
        context,
        brand,
        template,
        marketRegion: options.marketRegion,
        measure,
      });
      const def = FIELD_DEFINITIONS[field.type];
      const debugBox = options.debugFieldBoxes
        ? `<rect x="0" y="0" width="${fmt(field.w)}" height="${fmt(field.h)}" fill="none" stroke="#d0d0d0" stroke-width="0.1" />`
        : "";
      return (
        `<g transform="translate(${fmt(field.x)},${fmt(field.y)})" data-field-id="${esc(field.id)}" data-field-type="${esc(def.type)}">` +
        debugBox +
        inner +
        `</g>`
      );
    })
    .join("");

  const sizingAttrs =
    options.sizing === "fill"
      ? `width="100%" height="100%"`
      : `width="${fmt(template.width)}mm" height="${fmt(template.height)}mm"`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" ` +
    `viewBox="0 0 ${fmt(template.width)} ${fmt(template.height)}" ` +
    sizingAttrs + ` ` +
    `shape-rendering="geometricPrecision" ` +
    `text-rendering="optimizeLegibility">` +
    // White background — labels are printed on white stock.
    `<rect x="0" y="0" width="${fmt(template.width)}" height="${fmt(template.height)}" fill="#ffffff" />` +
    fields +
    `</svg>`
  );
}
