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
import { getNutrientsByMarket } from "@/lib/nutrition";
import {
  FIELD_DEFINITIONS,
  effectiveFieldSizePt,
  effectiveLabelWeightG,
  formatLabelDate,
  formatNetWeight,
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

/** System font stack — chosen so the editor preview matches the printed PNG
 *  on both Mac and Windows. Browsers substitute consistently; Node rasterisers
 *  fall back to whatever serif/sans is installed. */
const FONT_FAMILY = `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`;

const COLOR_TEXT = "#222222";
const COLOR_TEXT_DIM = "#444444";
const COLOR_TEXT_MUTED = "#666666";
const COLOR_TEXT_PLACEHOLDER = "#888888";
const COLOR_BORDER = "#111111";
const PLACEHOLDER = "—";

// ---------------------------------------------------------------------------
// Text measurement
// ---------------------------------------------------------------------------

/** Returns the rendered width (in user units == mm) of `text` at `fontMm`. */
export type TextMeasurer = (
  text: string,
  fontMm: number,
  weight?: number,
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
export const browserMeasurer: TextMeasurer = (text, fontMm, weight = 400) => {
  const ctx = getBrowserMeasureCtx();
  if (!ctx) return heuristicMeasurer(text, fontMm, weight);
  ctx.font = `${weight} ${fontMm}px ${FONT_FAMILY}`;
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
): string[] {
  if (!text) return [];
  const out: string[] = [];
  for (const src of text.split("\n")) {
    if (!src) { out.push(""); continue; }
    if (measure(src, fontMm, weight) <= maxWidthMm) { out.push(src); continue; }
    const words = src.split(" ");
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (measure(candidate, fontMm, weight) <= maxWidthMm) {
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
// SVG element helpers
// ---------------------------------------------------------------------------

interface TextOpts {
  fontMm: number;
  weight?: number;
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
    fill = COLOR_TEXT,
    anchor = "start",
    italic = false,
    letterSpacing,
  } = opts;
  const attrs: string[] = [
    `x="${fmt(x)}"`,
    `y="${fmt(y)}"`,
    `font-family="${FONT_FAMILY}"`,
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

const RENDERERS: Record<LabelFieldType, SvgFieldRenderer> = {
  // ────────────────────── product / batch ──────────────────────
  name: ({ field, context }) => {
    const p = field.props ?? {};
    const fontMm = ptToMm(effectiveFieldSizePt("name", p.size));
    const weight = p.weight ?? 600;
    return textEl(context?.name || PLACEHOLDER, 0, 0, {
      fontMm,
      weight,
      letterSpacing: -fontMm * 0.02,
    });
  },

  subtitle: ({ field, measure }) => {
    const p = field.props ?? {};
    const fontMm = ptToMm(effectiveFieldSizePt("subtitle", p.size));
    const lines = wrapLines(p.text || PLACEHOLDER, field.w, fontMm, 400, measure);
    return multiLine(lines, 0, 0, { fontMm, fill: COLOR_TEXT_DIM });
  },

  weight: ({ field, context, template }) => {
    const p = field.props ?? {};
    const fontMm = ptToMm(effectiveFieldSizePt("weight", p.size));
    return textEl(
      formatNetWeight(effectiveLabelWeightG(context, template)),
      0,
      0,
      { fontMm },
    );
  },

  ingr: ({ field, context, measure }) => {
    const p = field.props ?? {};
    const fontMm = ptToMm(effectiveFieldSizePt("ingr", p.size));
    const lineHeight = fontMm * 1.42;
    const ings = context?.ingredients ?? [];
    if (ings.length === 0) {
      return textEl(PLACEHOLDER, 0, 0, { fontMm, fill: COLOR_TEXT });
    }
    return renderIngredientLinesSvg(ings, field.w, fontMm, lineHeight, p.boldAllergens !== false, measure);
  },

  aller: ({ field, context }) => {
    const p = field.props ?? {};
    const fontMm = ptToMm(effectiveFieldSizePt("aller", p.size));
    const lineHeight = fontMm * 1.42;
    const allergens = context?.allergens ?? [];
    const mayContain = context?.mayContain ?? [];
    const parts: string[] = [];
    if (allergens.length > 0) {
      parts.push(textEl(allergens.map(allergenLabel).join(" · "), 0, 0, {
        fontMm,
        weight: 700,
      }));
    } else {
      parts.push(textEl(PLACEHOLDER, 0, 0, {
        fontMm,
        fill: COLOR_TEXT_PLACEHOLDER,
      }));
    }
    if (mayContain.length > 0) {
      parts.push(textEl(mayContain.map(allergenLabel).join(" · "), 0, lineHeight, {
        fontMm,
        fill: COLOR_TEXT_MUTED,
        italic: true,
      }));
    }
    return parts.join("");
  },

  nutri: ({ field, context, marketRegion }) => {
    const p = field.props ?? {};
    const fontMm = ptToMm(effectiveFieldSizePt("nutri", p.size));
    const lineHeight = fontMm * 1.32;
    const data = context?.nutritionPer100g ?? {};
    const nutrients = getNutrientsByMarket(marketRegion ?? "EU");
    return nutrients
      .map((nut, i) => {
        const val = data[nut.key];
        const indentMm = nut.indent * fontMm * 0.5;
        const valStr = val == null ? PLACEHOLDER : `${val}${nut.unit}`;
        return textEl(`${nut.label} ${valStr}`, indentMm, i * lineHeight, {
          fontMm,
          fill: COLOR_TEXT,
        });
      })
      .join("");
  },

  bbe: ({ field, context }) => {
    const p = field.props ?? {};
    const fontMm = ptToMm(effectiveFieldSizePt("bbe", p.size));
    return textEl(formatLabelDate(context?.bestBefore ?? null, p.dateFormat), 0, 0, { fontMm });
  },

  batch: ({ field, context }) => {
    const p = field.props ?? {};
    const fontMm = ptToMm(effectiveFieldSizePt("batch", p.size));
    return textEl(context?.batchNumber || PLACEHOLDER, 0, 0, { fontMm });
  },

  prodate: ({ field, context }) => {
    const p = field.props ?? {};
    const fontMm = ptToMm(effectiveFieldSizePt("prodate", p.size));
    return textEl(formatLabelDate(context?.producedAt ?? null, p.dateFormat), 0, 0, { fontMm });
  },

  origin: ({ field, context }) => {
    const p = field.props ?? {};
    const fontMm = ptToMm(effectiveFieldSizePt("origin", p.size));
    return textEl(context?.origin || PLACEHOLDER, 0, 0, { fontMm });
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
    const lineHeight = fontMm * 1.35;
    const lines: Array<{ text: string; bold: boolean }> = [];
    if (brand.name) lines.push({ text: brand.name, bold: true });
    if (brand.address) {
      for (const line of brand.address.split("\n")) {
        for (const wrapped of wrapLines(line, field.w, fontMm, 400, measure)) {
          lines.push({ text: wrapped, bold: false });
        }
      }
    }
    if (lines.length === 0) {
      return textEl(PLACEHOLDER, 0, 0, {
        fontMm,
        fill: COLOR_TEXT_PLACEHOLDER,
      });
    }
    return lines
      .map((l, i) =>
        textEl(l.text, 0, i * lineHeight, {
          fontMm,
          weight: l.bold ? 700 : 400,
          fill: COLOR_TEXT,
        }),
      )
      .join("");
  },

  contact: ({ field, brand }) => {
    const p = field.props ?? {};
    const fontMm = ptToMm(effectiveFieldSizePt("contact", p.size));
    return textEl(brand.contact || PLACEHOLDER, 0, 0, { fontMm, fill: COLOR_TEXT_DIM });
  },

  socials: ({ field, brand, measure }) => {
    const p = field.props ?? {};
    const fontMm = ptToMm(effectiveFieldSizePt("socials", p.size));
    const lineHeight = fontMm * 1.4;
    const socials = brand.socials ?? [];
    if (socials.length === 0) {
      return textEl(PLACEHOLDER, 0, 0, {
        fontMm,
        fill: COLOR_TEXT_PLACEHOLDER,
      });
    }
    return socials
      .map((s, i) => {
        const y = i * lineHeight;
        const labelStr = `${s.label} `;
        const labelW = measure(labelStr, fontMm, 400);
        // Emit label (muted) and url (body) as two adjacent <text> elements —
        // simpler than tspan alignment, perfectly fine for left-anchored rows.
        return (
          textEl(labelStr, 0, y, { fontMm, fill: COLOR_TEXT_MUTED }) +
          textEl(s.url, labelW, y, { fontMm, fill: COLOR_TEXT })
        );
      })
      .join("");
  },

  qr: ({ field, brand }) => {
    const p = field.props ?? {};
    const url = p.qrUrl || brand.socials?.[0]?.url || "";
    // Real QR rendering is deferred — the editor and print preview show a
    // 3-corner-marker placeholder so positioning + sizing can be designed
    // today. The intended target URL is exposed via `data-qr-url` so the
    // print pipeline can swap in a real vector QR without changing layouts.
    const w = field.w;
    const h = field.h;
    const m = Math.min(w, h);
    const c = m * 0.18;
    return (
      `<g data-qr-url="${esc(url)}">` +
      `<rect x="0" y="0" width="${fmt(w)}" height="${fmt(h)}" fill="#ffffff" stroke="${COLOR_BORDER}" stroke-width="0.15" />` +
      `<rect x="${fmt(m * 0.1)}" y="${fmt(m * 0.1)}" width="${fmt(c)}" height="${fmt(c)}" fill="${COLOR_BORDER}" />` +
      `<rect x="${fmt(w - m * 0.1 - c)}" y="${fmt(m * 0.1)}" width="${fmt(c)}" height="${fmt(c)}" fill="${COLOR_BORDER}" />` +
      `<rect x="${fmt(m * 0.1)}" y="${fmt(h - m * 0.1 - c)}" width="${fmt(c)}" height="${fmt(c)}" fill="${COLOR_BORDER}" />` +
      `</g>`
    );
  },

  // ────────────────────── custom ──────────────────────
  text: ({ field, measure }) => {
    const p = field.props ?? {};
    const fontMm = ptToMm(effectiveFieldSizePt("text", p.size));
    const lines = wrapLines(p.text || PLACEHOLDER, field.w, fontMm, 400, measure);
    return multiLine(lines, 0, 0, {
      fontMm,
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
  measure: TextMeasurer,
): string {
  // Tokenize: alternating ingredient names and ", " separators.
  type Tok = { text: string; bold: boolean };
  const toks: Tok[] = [];
  ingredients.forEach((ing, i) => {
    if (i > 0) toks.push({ text: ", ", bold: false });
    toks.push({ text: ing.name, bold: boldAllergens && ing.allergens.length > 0 });
  });

  // Pack tokens into lines greedily, measuring each candidate.
  const lines: Tok[][] = [];
  let current: Tok[] = [];
  let currentWidth = 0;
  for (const tok of toks) {
    const w = measure(tok.text, fontMm, tok.bold ? 700 : 400);
    if (currentWidth + w <= maxWidthMm || current.length === 0) {
      current.push(tok);
      currentWidth += w;
    } else {
      lines.push(current);
      current = [tok];
      currentWidth = w;
    }
  }
  if (current.length > 0) lines.push(current);

  // Emit each line as a <text> with <tspan> children for bold/non-bold runs.
  return lines
    .map((line, i) => {
      const y = i * lineHeightMm;
      const tspans = line
        .map((t) => {
          if (t.bold) {
            return `<tspan font-weight="700">${esc(t.text)}</tspan>`;
          }
          return esc(t.text);
        })
        .join("");
      return (
        `<text x="0" y="${fmt(y)}" font-family="${FONT_FAMILY}" font-size="${fmt(fontMm)}" fill="${COLOR_TEXT}" dominant-baseline="hanging">${tspans}</text>`
      );
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
