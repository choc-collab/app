/**
 * Field definitions, pure helpers, and metadata for the label-template system.
 *
 * The actual rendering lives in `labelSvg.ts` — both the editor preview and
 * the print pipeline consume the SVG it produces, so what the user designs is
 * literally what gets printed. This module owns the registry of field types
 * (`FIELD_DEFINITIONS`), the date-format helpers used by the renderers and
 * inspector, and the per-cavity weight / pieces-per-label helpers used by
 * editor diagnostics. No React or JSX is needed here anymore.
 */

import type {
  LabelContext,
  LabelDateFormat,
  LabelFieldProps,
  LabelFieldType,
  LabelTemplate,
} from "@/types";

// ---------------------------------------------------------------------------
// Definitions — group + default size + display label per field type
// ---------------------------------------------------------------------------

export type LabelFieldGroup = "product" | "brand" | "custom";

export interface FieldDefinition {
  type: LabelFieldType;
  group: LabelFieldGroup;
  /** Display name shown in the editor's left rail and inspector. */
  label: string;
  /** Default width in millimetres when the field is dropped onto the canvas. */
  defaultW: number;
  /** Default height in millimetres when the field is dropped onto the canvas. */
  defaultH: number;
  /** Default font size in points. Used by the renderer when `props.size` is
   *  unset, and by the inspector to pre-fill / reset the size control.
   *  Omitted for fields without text (logo, qr, divider, image). */
  defaultSizePt?: number;
}

export const FIELD_DEFINITIONS: Record<LabelFieldType, FieldDefinition> = {
  // product / batch (auto)
  name:     { type: "name",     group: "product", label: "Product name",    defaultW: 50, defaultH: 8,  defaultSizePt: 22 },
  subtitle: { type: "subtitle", group: "product", label: "Subtitle / line", defaultW: 50, defaultH: 4,  defaultSizePt: 10 },
  weight:   { type: "weight",   group: "product", label: "Net weight",      defaultW: 14, defaultH: 4,  defaultSizePt: 10 },
  ingr:     { type: "ingr",     group: "product", label: "Ingredients",     defaultW: 50, defaultH: 14, defaultSizePt: 9 },
  aller:    { type: "aller",    group: "product", label: "Allergens",       defaultW: 28, defaultH: 8,  defaultSizePt: 9 },
  nutri:    { type: "nutri",    group: "product", label: "Nutrition table", defaultW: 32, defaultH: 12, defaultSizePt: 7 },
  bbe:      { type: "bbe",      group: "product", label: "Best-before",     defaultW: 22, defaultH: 4,  defaultSizePt: 9 },
  batch:    { type: "batch",    group: "product", label: "Batch number",    defaultW: 18, defaultH: 4,  defaultSizePt: 9 },
  prodate:  { type: "prodate",  group: "product", label: "Production date", defaultW: 22, defaultH: 4,  defaultSizePt: 9 },
  origin:   { type: "origin",   group: "product", label: "Origin / cocoa %",defaultW: 28, defaultH: 4,  defaultSizePt: 9 },
  // brand / business (auto)
  logo:     { type: "logo",     group: "brand",   label: "Logo",            defaultW: 14, defaultH: 14 },
  company:  { type: "company",  group: "brand",   label: "Company info",    defaultW: 50, defaultH: 6,  defaultSizePt: 7.5 },
  contact:  { type: "contact",  group: "brand",   label: "Contact",         defaultW: 40, defaultH: 4,  defaultSizePt: 7.5 },
  socials:  { type: "socials",  group: "brand",   label: "Links",           defaultW: 40, defaultH: 6,  defaultSizePt: 7 },
  qr:       { type: "qr",       group: "brand",   label: "QR code",         defaultW: 14, defaultH: 14 },
  // custom (manual)
  text:     { type: "text",     group: "custom",  label: "Free text",       defaultW: 30, defaultH: 4,  defaultSizePt: 9 },
  divider:  { type: "divider",  group: "custom",  label: "Divider line",    defaultW: 50, defaultH: 1 },
  image:    { type: "image",    group: "custom",  label: "Image",           defaultW: 18, defaultH: 18 },
};

/** Resolve the effective font size for a field — `props.size` when set,
 *  otherwise the field type's `defaultSizePt`, otherwise a 9pt fallback for
 *  any field that might somehow lack a default. Pure. */
export function effectiveFieldSizePt(type: LabelFieldType, propsSize: number | undefined): number {
  if (Number.isFinite(propsSize) && (propsSize as number) > 0) return propsSize as number;
  return FIELD_DEFINITIONS[type].defaultSizePt ?? 9;
}

// ---------------------------------------------------------------------------
// Pure helpers — exported so the linter and tests can reach them
// ---------------------------------------------------------------------------

/** Default date pattern (ISO 8601) when no `dateFormat` prop is set. */
export const DEFAULT_DATE_FORMAT = "YYYY-MM-DD";

/** A handful of presets the inspector exposes as one-click chips. The user can
 *  type any pattern they like into the input — these are just shortcuts. */
export const DATE_FORMAT_PRESETS: ReadonlyArray<{ pattern: string; hint: string }> = [
  { pattern: "YYYY-MM-DD", hint: "ISO" },
  { pattern: "DD/MM/YYYY", hint: "EU" },
  { pattern: "MM/DD/YYYY", hint: "US" },
  { pattern: "DD.MM.YYYY", hint: "DE" },
  { pattern: "DD-MM-YYYY", hint: "NL" },
  { pattern: "DD MM YY",   hint: "short" },
];

/** Migration map for the pre-pattern enum values. Templates saved before the
 *  switch carry strings like "iso" / "dmy-slash" which aren't valid patterns
 *  on their own; transparently rewrite them so old templates keep working. */
const LEGACY_FORMAT_MIGRATION: Record<string, string> = {
  "iso":       "YYYY-MM-DD",
  "dmy-slash": "DD/MM/YYYY",
  "mdy-slash": "MM/DD/YYYY",
  "dmy-dot":   "DD.MM.YYYY",
  "dmy-dash":  "DD-MM-YYYY",
};

// Token alternation has the longer alternatives first so "YYYY" wins over
// "YY" at the same position (JS regex left-to-right alternation), and so on.
const TOKEN_RE = /YYYY|YY|MM|M|DD|D/g;

/**
 * Format a date by substituting `YYYY` / `YY` / `MM` / `M` / `DD` / `D`
 * tokens inside the supplied pattern. Anything else in the pattern is printed
 * verbatim, so the user can mix any separator they want.
 *
 * - No localised month names → SSR/CSR identical, language-neutral.
 * - Date components read in UTC so timezone drift doesn't bump the day
 *   between server-rendered and client-rendered output.
 * - Returns an em-dash when the date is missing.
 * - Old pre-pattern enum values ("iso", "dmy-slash", …) are migrated on the
 *   fly so templates saved before this change keep printing the right date.
 */
export function formatLabelDate(date: Date | null | undefined, format: LabelDateFormat = DEFAULT_DATE_FORMAT): string {
  if (!date) return "—";
  const pattern = LEGACY_FORMAT_MIGRATION[format] ?? format;
  const yyyy = String(date.getUTCFullYear()).padStart(4, "0");
  const yy   = yyyy.slice(-2);
  const m    = String(date.getUTCMonth() + 1);
  const mm   = m.padStart(2, "0");
  const d    = String(date.getUTCDate());
  const dd   = d.padStart(2, "0");
  return pattern.replace(TOKEN_RE, (token) => {
    switch (token) {
      case "YYYY": return yyyy;
      case "YY":   return yy;
      case "MM":   return mm;
      case "M":    return m;
      case "DD":   return dd;
      case "D":    return d;
      default:     return token;
    }
  });
}

/** Returns the effective pieces-per-label for a template. Defaults to 1 when
 *  the template hasn't set the override. */
export function effectivePiecesPerLabel(template: Pick<LabelTemplate, "piecesPerLabel"> | null | undefined): number {
  const n = template?.piecesPerLabel;
  return Number.isFinite(n) && (n as number) > 0 ? (n as number) : 1;
}

/** Net weight of one label, in grams.
 *
 *  `piecesPerLabel` only scales the production-batch case where
 *  `context.perCavityWeightG` is the weight of a single product piece. For
 *  filling-batch (total batch grams) and collection-package (total box grams)
 *  the resolver already stores the whole-unit weight there, so any value
 *  stored on the template would corrupt the output — we hard-code the
 *  multiplier to 1 for those kinds regardless of what the template carries. */
export function effectiveLabelWeightG(context: LabelContext | null, template: Pick<LabelTemplate, "piecesPerLabel"> | null | undefined): number {
  if (!context) return 0;
  const multiplier = context.source.kind === "production-batch"
    ? effectivePiecesPerLabel(template)
    : 1;
  return Math.round(context.perCavityWeightG * multiplier * 10) / 10;
}

/** Format the net weight as printed on a label (e.g. "90g"). Falls back to
 *  an em-dash when the weight is unknown. */
export function formatNetWeight(grams: number): string {
  if (!Number.isFinite(grams) || grams <= 0) return "—";
  // Whole grams above 10g, one decimal otherwise.
  return grams >= 10 ? `${Math.round(grams)}g` : `${grams.toFixed(1)}g`;
}

// ---------------------------------------------------------------------------
// Fonts — curated cross-platform list, no web-font loading required
// ---------------------------------------------------------------------------

export interface FontOption {
  /** Stable id stored on `LabelFieldProps.font`. Stays valid even if we rename
   *  the human-readable label or tweak the family stack later. */
  id: string;
  /** Display label shown in the inspector dropdown. */
  label: string;
  /** CSS font-family stack — always names at least one font available on iOS,
   *  macOS, Windows, and Linux so the rasterised PNG renders the same shape
   *  whether the user saves from an iPad or a desktop. */
  family: string;
  /** Loose grouping shown as `<optgroup>` headers in the inspector. */
  category: "sans" | "serif" | "mono" | "display";
}

/** Default font stack — used when `LabelFieldProps.font` is unset. */
export const DEFAULT_FONT_FAMILY =
  `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`;

/** Curated, cross-platform fonts the inspector exposes as a dropdown. Adding
 *  a new entry is one line — the id becomes the saved value, so leave existing
 *  ids alone or templates that use them will fall back to the default. */
export const FONT_OPTIONS: ReadonlyArray<FontOption> = [
  { id: "system",    label: "System default", family: DEFAULT_FONT_FAMILY,                                            category: "sans"    },
  { id: "helvetica", label: "Helvetica",      family: `"Helvetica Neue", Helvetica, Arial, sans-serif`,               category: "sans"    },
  { id: "arial",     label: "Arial",          family: `Arial, Helvetica, sans-serif`,                                 category: "sans"    },
  { id: "verdana",   label: "Verdana",        family: `Verdana, Geneva, Tahoma, sans-serif`,                          category: "sans"    },
  { id: "trebuchet", label: "Trebuchet",      family: `"Trebuchet MS", "Lucida Sans", sans-serif`,                    category: "sans"    },
  { id: "georgia",   label: "Georgia",        family: `Georgia, "Times New Roman", serif`,                            category: "serif"   },
  { id: "times",     label: "Times",          family: `"Times New Roman", Times, serif`,                              category: "serif"   },
  { id: "palatino",  label: "Palatino",       family: `"Palatino Linotype", Palatino, "Book Antiqua", serif`,         category: "serif"   },
  { id: "courier",   label: "Courier",        family: `"Courier New", Courier, monospace`,                            category: "mono"    },
  { id: "menlo",     label: "Menlo",          family: `Menlo, Consolas, "Courier New", monospace`,                    category: "mono"    },
  { id: "impact",    label: "Impact",         family: `Impact, "Haettenschweiler", "Arial Narrow Bold", sans-serif`,  category: "display" },
];

/** Resolve a saved font id to its CSS family stack. Unknown / unset ids fall
 *  back to the default so old templates and bad data never break the layout. */
export function resolveFontFamily(id: string | undefined | null): string {
  if (!id) return DEFAULT_FONT_FAMILY;
  return FONT_OPTIONS.find((f) => f.id === id)?.family ?? DEFAULT_FONT_FAMILY;
}

/** Convenience: group fonts by category for the inspector's `<optgroup>`s. */
export const FONT_OPTIONS_BY_CATEGORY: Record<FontOption["category"], FontOption[]> = {
  sans:    FONT_OPTIONS.filter((f) => f.category === "sans"),
  serif:   FONT_OPTIONS.filter((f) => f.category === "serif"),
  mono:    FONT_OPTIONS.filter((f) => f.category === "mono"),
  display: FONT_OPTIONS.filter((f) => f.category === "display"),
};

/** Look up a field's metadata (group, label, defaults). */
export function getFieldDefinition(type: LabelFieldType): FieldDefinition {
  return FIELD_DEFINITIONS[type];
}

/** All field types grouped for the editor's left rail. */
export const FIELD_TYPES_BY_GROUP: Record<LabelFieldGroup, LabelFieldType[]> = {
  product: (Object.values(FIELD_DEFINITIONS).filter((d) => d.group === "product").map((d) => d.type)),
  brand:   (Object.values(FIELD_DEFINITIONS).filter((d) => d.group === "brand").map((d) => d.type)),
  custom:  (Object.values(FIELD_DEFINITIONS).filter((d) => d.group === "custom").map((d) => d.type)),
};

/** Re-export `LabelFieldProps` for renderer-adjacent callers. */
export type { LabelFieldProps };
